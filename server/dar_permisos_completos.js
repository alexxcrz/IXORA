// Script para dar permisos completos de administración a un usuario
import { createEncryptedDatabase } from './src/config/dbEncryption.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const dbUsers = createEncryptedDatabase('usuarios.db');

// Verificar que la DB está accesible
try {
  dbUsers.prepare('SELECT 1').get();
  console.log('✅ Conexión a usuarios.db exitosa\n');
} catch (err) {
  console.error('❌ Error conectando a usuarios.db:', err.message);
  process.exit(1);
}

function mostrarUsuarios() {
  const usuarios = dbUsers.prepare(`
    SELECT id, name, phone, username, es_sistema 
    FROM users 
    ORDER BY es_sistema DESC, id
  `).all();

  console.log('\n=== USUARIOS DISPONIBLES ===');
  usuarios.forEach(u => {
    const tipo = u.es_sistema ? '[SISTEMA]' : '[NORMAL]';
    console.log(`${u.id}. ${tipo} ${u.name} - Tel: ${u.phone || 'N/A'} - Usuario: ${u.username || 'N/A'}`);
  });
  console.log('');
}

function darPermisosCompletos(userId) {
  try {
    // Obtener el usuario
    const usuario = dbUsers.prepare('SELECT id, name, es_sistema FROM users WHERE id = ?').get(userId);
    
    if (!usuario) {
      console.log('❌ Usuario no encontrado');
      return;
    }

    console.log(`\n📝 Configurando permisos completos para: ${usuario.name}`);

    // 1. Asignar rol CEO (que ya tiene todos los permisos)
    const rolCEO = dbUsers.prepare('SELECT id FROM roles WHERE name = ?').get('CEO');
    
    if (rolCEO) {
      // Limpiar roles actuales
      dbUsers.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
      
      // Asignar rol CEO
      dbUsers.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, rolCEO.id);
      console.log('✅ Rol CEO asignado');
    } else {
      console.log('⚠️  Rol CEO no encontrado, asignando permisos individuales...');
      
      // 2. Dar TODOS los permisos directamente
      const todosLosPermisos = dbUsers.prepare('SELECT id, perm FROM permissions').all();
      
      // Limpiar permisos actuales
      dbUsers.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);
      
      // Insertar todos los permisos
      const insertPerm = dbUsers.prepare('INSERT INTO user_permissions (user_id, perm_id) VALUES (?, ?)');
      
      todosLosPermisos.forEach(perm => {
        insertPerm.run(userId, perm.id);
      });
      
      console.log(`✅ ${todosLosPermisos.length} permisos asignados directamente`);
    }

    // 3. Verificar permisos del usuario
    const permisosUsuario = dbUsers.prepare(`
      SELECT COUNT(*) as total FROM user_permissions WHERE user_id = ?
    `).get(userId);

    const rolesUsuario = dbUsers.prepare(`
      SELECT r.name FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).all(userId);

    console.log('\n📊 RESULTADO:');
    console.log(`   - Roles: ${rolesUsuario.map(r => r.name).join(', ') || 'Ninguno'}`);
    console.log(`   - Permisos directos: ${permisosUsuario.total}`);
    console.log('\n✅ Permisos configurados correctamente');
    console.log('   El usuario ahora tiene acceso completo al sistema');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

function preguntarUsuario() {
  rl.question('Ingresa el ID del usuario (o "salir" para terminar): ', (respuesta) => {
    if (respuesta.toLowerCase() === 'salir') {
      console.log('\n👋 Saliendo...\n');
      dbUsers.close();
      rl.close();
      return;
    }

    const userId = parseInt(respuesta);
    if (isNaN(userId)) {
      console.log('❌ ID inválido. Debe ser un número.');
      preguntarUsuario();
      return;
    }

    darPermisosCompletos(userId);
    
    rl.question('\n¿Configurar otro usuario? (s/n): ', (continuar) => {
      if (continuar.toLowerCase() === 's' || continuar.toLowerCase() === 'si') {
        mostrarUsuarios();
        preguntarUsuario();
      } else {
        console.log('\n👋 Saliendo...\n');
        dbUsers.close();
        rl.close();
      }
    });
  });
}

// Iniciar
mostrarUsuarios();
preguntarUsuario();
