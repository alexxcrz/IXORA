export const conocimientosProgramacion = {
  react: {
    useState: `useState es un Hook de React que te permite agregar estado a componentes funcionales.

Ejemplo básico:
\`\`\`javascript
import { useState } from 'react';

function Contador() {
  const [contador, setContador] = useState(0);
  
  return (
    <div>
      <p>Contador: {contador}</p>
      <button onClick={() => setContador(contador + 1)}>
        Incrementar
      </button>
    </div>
  );
}
\`\`\`

Ejemplo con objeto:
\`\`\`javascript
const [usuario, setUsuario] = useState({ nombre: '', email: '' });

// Actualizar objeto correctamente
setUsuario(prev => ({ ...prev, nombre: 'Juan' }));
\`\`\`

💡 Mejores prácticas:
- Usa nombres descriptivos para el estado y su setter
- Inicializa con el tipo correcto (número, string, array, objeto)
- Para objetos/arrays, usa el spread operator para actualizar
- Evita mutaciones directas del estado`,

    useEffect: `useEffect te permite ejecutar efectos secundarios en componentes funcionales.

Ejemplo básico:
\`\`\`javascript
import { useState, useEffect } from 'react';

function Usuario({ userId }) {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Se ejecuta después de cada render
    fetch(\`/api/usuarios/\${userId}\`)
      .then(res => res.json())
      .then(data => {
        setUsuario(data);
        setLoading(false);
      });
  }, [userId]); // Solo se ejecuta si userId cambia
  
  if (loading) return <div>Cargando...</div>;
  return <div>{usuario?.nombre}</div>;
}
\`\`\`

Cleanup function:
\`\`\`javascript
useEffect(() => {
  const interval = setInterval(() => {
    console.log('Tick');
  }, 1000);
  
  // Cleanup: se ejecuta al desmontar o antes del siguiente efecto
  return () => clearInterval(interval);
}, []);
\`\`\`

💡 Dependencias importantes:
- Array vacío [] = solo al montar
- [variable] = cuando variable cambia
- Sin array = en cada render (¡evitar!)
- Cleanup function para limpiar suscripciones, timers, etc.`,

    useContext: `useContext te permite acceder al contexto sin prop drilling.

Ejemplo:
\`\`\`javascript
// 1. Crear contexto
const ThemeContext = createContext();

// 2. Provider
function App() {
  const [theme, setTheme] = useState('dark');
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <ComponenteHijo />
    </ThemeContext.Provider>
  );
}

// 3. Consumir contexto
function ComponenteHijo() {
  const { theme, setTheme } = useContext(ThemeContext);
  
  return (
    <div className={theme}>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        Cambiar tema
      </button>
    </div>
  );
}
\`\`\``,

    useCallback: `useCallback memoriza una función para evitar recrearla en cada render.

Ejemplo:
\`\`\`javascript
const [contador, setContador] = useState(0);
const [nombre, setNombre] = useState('');

// Sin useCallback: se recrea en cada render
const handleClick = () => setContador(c => c + 1);

// Con useCallback: solo se recrea si las dependencias cambian
const handleClickMemo = useCallback(() => {
  setContador(c => c + 1);
}, []); // Sin dependencias = nunca se recrea

// Útil cuando pasas funciones como props a componentes memoizados
const HijoMemo = React.memo(({ onClick }) => {
  return <button onClick={onClick}>Click</button>;
});
\`\`\``,

    useMemo: `useMemo memoriza un valor calculado para evitar recalcularlo.

Ejemplo:
\`\`\`javascript
const [numeros] = useState([1, 2, 3, 4, 5]);
const [filter, setFilter] = useState('');

// Sin useMemo: se recalcula en cada render
const numerosFiltrados = numeros.filter(n => n > 3);

// Con useMemo: solo se recalcula si numeros o filter cambian
const numerosFiltradosMemo = useMemo(() => {
  return numeros.filter(n => n > filter);
}, [numeros, filter]);
\`\`\``,

    useRef: `useRef te da una referencia mutable que persiste entre renders.

Ejemplo:
\`\`\`javascript
function InputFocus() {
  const inputRef = useRef(null);
  
  const focusInput = () => {
    inputRef.current?.focus();
  };
  
  return (
    <>
      <input ref={inputRef} type="text" />
      <button onClick={focusInput}>Enfocar input</button>
    </>
  );
}

// Guardar valores sin causar re-render
const contadorRef = useRef(0);
contadorRef.current += 1; // No causa re-render
\`\`\``,

    customHooks: `Los Custom Hooks te permiten reutilizar lógica de estado.

Ejemplo:
\`\`\`javascript
// Custom Hook
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, [url]);
  
  return { data, loading, error };
}

// Uso
function Usuario({ userId }) {
  const { data: usuario, loading, error } = useFetch(\`/api/usuarios/\${userId}\`);
  
  if (loading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{usuario.nombre}</div>;
}
\`\`\``,

    performance: `Optimización de rendimiento en React:

1. React.memo: Memoriza componentes
\`\`\`javascript
const ComponenteMemo = React.memo(({ nombre }) => {
  return <div>{nombre}</div>;
});
\`\`\`

2. useMemo para cálculos costosos
3. useCallback para funciones pasadas como props
4. Code splitting con React.lazy
\`\`\`javascript
const ComponenteLazy = React.lazy(() => import('./Componente'));
\`\`\`

5. Virtualización para listas grandes (react-window)
6. Evitar re-renders innecesarios
7. Usar keys estables en listas`
  },

  // ============================================
  // JAVASCRIPT - Completo
  // ============================================
  javascript: {
    async: `async/await es la forma moderna de manejar promesas en JavaScript.

Ejemplo básico:
\`\`\`javascript
// Con async/await (recomendado)
async function obtenerDatos() {
  try {
    const response = await fetch('/api/datos');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Uso
obtenerDatos()
  .then(data => console.log(data))
  .catch(error => console.error(error));
\`\`\`

Múltiples promesas:
\`\`\`javascript
// Paralelo (más rápido)
const [usuario, posts] = await Promise.all([
  fetch('/api/usuario').then(r => r.json()),
  fetch('/api/posts').then(r => r.json())
]);

// Secuencial
for (const url of urls) {
  const data = await fetch(url).then(r => r.json());
  procesar(data);
}
\`\`\`

💡 Ventajas:
- Código más legible y fácil de seguir
- Manejo de errores con try/catch
- Evita el "callback hell"`,

    promise: `Las Promesas representan un valor que puede estar disponible ahora, en el futuro, o nunca.

Ejemplo básico:
\`\`\`javascript
const promesa = new Promise((resolve, reject) => {
  setTimeout(() => {
    const exito = true;
    if (exito) {
      resolve('¡Operación exitosa!');
    } else {
      reject('Error en la operación');
    }
  }, 1000);
});

promesa
  .then(resultado => console.log(resultado))
  .catch(error => console.error(error));
\`\`\`

Métodos útiles:
\`\`\`javascript
// Promise.all: todas deben cumplirse
Promise.all([promesa1, promesa2])
  .then(([resultado1, resultado2]) => {
    // Ambas exitosas
  });

// Promise.allSettled: espera todas (exitosas o no)
Promise.allSettled([promesa1, promesa2])
  .then(resultados => {
    resultados.forEach(({ status, value, reason }) => {
      if (status === 'fulfilled') console.log(value);
      else console.error(reason);
    });
  });

// Promise.race: la primera que se resuelva
Promise.race([promesa1, promesa2])
  .then(primera => console.log(primera));
\`\`\``,

    closure: `Los closures (clausuras) permiten que una función acceda a variables de su scope externo.

Ejemplo:
\`\`\`javascript
function crearContador() {
  let contador = 0; // Variable privada
  
  return function() {
    contador++;
    return contador;
  };
}

const contar = crearContador();
console.log(contar()); // 1
console.log(contar()); // 2
console.log(contar()); // 3
// contador no es accesible desde fuera
\`\`\`

Uso común:
\`\`\`javascript
// Módulo pattern
const modulo = (function() {
  let privado = 0;
  
  return {
    getPrivado: () => privado,
    incrementar: () => privado++
  };
})();
\`\`\``,

    this: `'this' se refiere al contexto de ejecución. Su valor depende de cómo se llama la función.

Ejemplo:
\`\`\`javascript
const objeto = {
  nombre: 'Juan',
  saludar: function() {
    console.log(\`Hola, soy \${this.nombre}\`);
  },
  saludarArrow: () => {
    // Arrow functions NO tienen su propio 'this'
    console.log(this.nombre); // undefined
  }
};

objeto.saludar(); // "Hola, soy Juan"

// Perder contexto
const funcion = objeto.saludar;
funcion(); // undefined (this es window/global)

// Soluciones:
funcion.bind(objeto)(); // bind
funcion.call(objeto); // call
funcion.apply(objeto); // apply
\`\`\``,

    destructuring: `La desestructuración permite extraer valores de arrays u objetos.

Ejemplo:
\`\`\`javascript
// Arrays
const [primero, segundo, ...resto] = [1, 2, 3, 4, 5];
// primero = 1, segundo = 2, resto = [3, 4, 5]

// Objetos
const { nombre, edad, ...otros } = { nombre: 'Juan', edad: 30, ciudad: 'Madrid' };
// nombre = 'Juan', edad = 30, otros = { ciudad: 'Madrid' }

// Renombrar
const { nombre: nombreUsuario } = { nombre: 'Juan' };

// Valores por defecto
const { nombre = 'Anónimo', edad = 0 } = {};

// En parámetros de función
function saludar({ nombre, edad = 18 }) {
  console.log(\`\${nombre}, \${edad} años\`);
}
\`\`\``,

    spread: `El spread operator (...) permite expandir arrays u objetos.

Ejemplo:
\`\`\`javascript
// Arrays
const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];
const combinado = [...arr1, ...arr2]; // [1, 2, 3, 4, 5, 6]

// Copiar array
const copia = [...arr1];

// Objetos
const obj1 = { a: 1, b: 2 };
const obj2 = { c: 3, d: 4 };
const combinado = { ...obj1, ...obj2 }; // { a: 1, b: 2, c: 3, d: 4 }

// Actualizar objeto (React)
setUsuario(prev => ({ ...prev, nombre: 'Nuevo nombre' }));

// Rest parameters
function sumar(...numeros) {
  return numeros.reduce((acc, n) => acc + n, 0);
}
sumar(1, 2, 3, 4); // 10
\`\`\``,

    array: `Métodos útiles de arrays en JavaScript:

\`\`\`javascript
const numeros = [1, 2, 3, 4, 5];

// map: transforma cada elemento
const dobles = numeros.map(n => n * 2); // [2, 4, 6, 8, 10]

// filter: filtra elementos
const pares = numeros.filter(n => n % 2 === 0); // [2, 4]

// find: encuentra el primer elemento
const mayor = numeros.find(n => n > 3); // 4

// findIndex: encuentra el índice
const indice = numeros.findIndex(n => n > 3); // 3

// some: verifica si alguno cumple
const hayPares = numeros.some(n => n % 2 === 0); // true

// every: verifica si todos cumplen
const todosPositivos = numeros.every(n => n > 0); // true

// reduce: reduce a un valor
const suma = numeros.reduce((acc, n) => acc + n, 0); // 15

// forEach: ejecuta función para cada elemento
numeros.forEach(n => console.log(n));

// flat: aplana arrays anidados
const anidado = [1, [2, 3], [4, 5]];
const plano = anidado.flat(); // [1, 2, 3, 4, 5]

// flatMap: map + flat
const resultado = numeros.flatMap(n => [n, n * 2]); // [1, 2, 2, 4, 3, 6...]
\`\`\``,

    objetos: `Trabajar con objetos en JavaScript:

\`\`\`javascript
// Crear objeto
const usuario = {
  nombre: 'Juan',
  edad: 30,
  // Método
  saludar() {
    return \`Hola, soy \${this.nombre}\`;
  },
  // Getter
  get info() {
    return \`\${this.nombre}, \${this.edad} años\`;
  },
  // Setter
  set nuevaEdad(valor) {
    if (valor > 0) this.edad = valor;
  }
};

// Acceder propiedades
usuario.nombre; // 'Juan'
usuario['nombre']; // 'Juan' (útil para propiedades dinámicas)

// Object.keys, values, entries
Object.keys(usuario); // ['nombre', 'edad', 'saludar', ...]
Object.values(usuario); // ['Juan', 30, function...]
Object.entries(usuario); // [['nombre', 'Juan'], ['edad', 30], ...]

// Copiar objeto
const copia = { ...usuario };
const copiaProfunda = JSON.parse(JSON.stringify(usuario));

// Fusionar objetos
const fusionado = Object.assign({}, obj1, obj2);
const fusionado2 = { ...obj1, ...obj2 };
\`\`\``,

    clases: `Clases en JavaScript (ES6+):

\`\`\`javascript
class Usuario {
  // Propiedades privadas (ES2022)
  #password;
  
  constructor(nombre, email) {
    this.nombre = nombre;
    this.email = email;
    this.#password = 'secreto';
  }
  
  // Método público
  saludar() {
    return \`Hola, soy \${this.nombre}\`;
  }
  
  // Método estático
  static crearAdmin(nombre) {
    const admin = new Usuario(nombre, 'admin@example.com');
    admin.esAdmin = true;
    return admin;
  }
  
  // Getter
  get info() {
    return \`\${this.nombre} (\${this.email})\`;
  }
  
  // Setter
  set nuevoEmail(email) {
    if (email.includes('@')) {
      this.email = email;
    }
  }
}

// Herencia
class Admin extends Usuario {
  constructor(nombre, email, permisos) {
    super(nombre, email);
    this.permisos = permisos;
  }
  
  // Sobrescribir método
  saludar() {
    return super.saludar() + ' (Admin)';
  }
}
\`\`\``
  },

  // ============================================
  // NODE.JS Y BACKEND
  // ============================================
  node: {
    express: `Express es un framework web minimalista para Node.js.

Ejemplo básico:
\`\`\`javascript
const express = require('express');
const app = express();

// Middleware para parsear JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta GET
app.get('/api/usuarios', (req, res) => {
  res.json({ usuarios: [] });
});

// Ruta con parámetros
app.get('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  res.json({ usuario: { id } });
});

// Ruta POST
app.post('/api/usuarios', (req, res) => {
  const { nombre, email } = req.body;
  res.json({ mensaje: \`Usuario \${nombre} creado\` });
});

// Ruta PUT
app.put('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  res.json({ mensaje: \`Usuario \${id} actualizado\` });
});

// Ruta DELETE
app.delete('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  res.json({ mensaje: \`Usuario \${id} eliminado\` });
});

app.listen(3000, () => {
  console.log('Servidor en puerto 3000');
});
\`\`\``,

    middleware: `Los middlewares son funciones que tienen acceso al objeto request, response y next.

Ejemplo básico:
\`\`\`javascript
// Middleware simple
const logger = (req, res, next) => {
  console.log(\`\${req.method} \${req.path}\`);
  next(); // Continuar al siguiente middleware
};

app.use(logger);

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Sin token' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Usar middleware
app.get('/api/protegido', authMiddleware, (req, res) => {
  res.json({ usuario: req.user });
});

// Middleware de manejo de errores (debe ir al final)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});
\`\`\``,

    router: `Routers permiten organizar rutas en módulos separados.

Ejemplo:
\`\`\`javascript
// routes/usuarios.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ usuarios: [] });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  res.json({ usuario: { id } });
});

module.exports = router;

// app.js
const usuariosRouter = require('./routes/usuarios');
app.use('/api/usuarios', usuariosRouter);
\`\`\``,

    asyncHandler: `Manejo de errores en rutas async:

\`\`\`javascript
// Wrapper para manejar errores en async
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Uso
app.get('/api/usuarios/:id', asyncHandler(async (req, res) => {
  const usuario = await Usuario.findById(req.params.id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  res.json(usuario);
}));
\`\`\``
  },

  // ============================================
  // BASES DE DATOS Y SQL
  // ============================================
  database: {
    sqlBasico: `SQL básico para consultas:

\`\`\`sql
-- SELECT
SELECT nombre, email FROM usuarios;
SELECT * FROM usuarios WHERE edad > 18;

-- INSERT
INSERT INTO usuarios (nombre, email, edad) 
VALUES ('Juan', 'juan@example.com', 30);

-- UPDATE
UPDATE usuarios 
SET nombre = 'Juan Pérez', edad = 31 
WHERE id = 1;

-- DELETE
DELETE FROM usuarios WHERE id = 1;

-- JOIN
SELECT u.nombre, p.titulo 
FROM usuarios u
INNER JOIN posts p ON u.id = p.usuario_id;

-- LEFT JOIN (incluye usuarios sin posts)
SELECT u.nombre, p.titulo 
FROM usuarios u
LEFT JOIN posts p ON u.id = p.usuario_id;

-- GROUP BY
SELECT categoria, COUNT(*) as total
FROM productos
GROUP BY categoria;

-- ORDER BY
SELECT * FROM usuarios ORDER BY nombre ASC;
SELECT * FROM usuarios ORDER BY edad DESC;

-- LIMIT
SELECT * FROM usuarios LIMIT 10;
SELECT * FROM usuarios LIMIT 10 OFFSET 20; -- Paginación
\`\`\``,

    joins: `Tipos de JOIN en SQL:

\`\`\`sql
-- INNER JOIN: Solo registros que coinciden en ambas tablas
SELECT u.nombre, p.titulo
FROM usuarios u
INNER JOIN posts p ON u.id = p.usuario_id;

-- LEFT JOIN: Todos los de la izquierda + coincidencias de la derecha
SELECT u.nombre, p.titulo
FROM usuarios u
LEFT JOIN posts p ON u.id = p.usuario_id;

-- RIGHT JOIN: Todos los de la derecha + coincidencias de la izquierda
SELECT u.nombre, p.titulo
FROM usuarios u
RIGHT JOIN posts p ON u.id = p.usuario_id;

-- FULL OUTER JOIN: Todos los registros de ambas tablas
SELECT u.nombre, p.titulo
FROM usuarios u
FULL OUTER JOIN posts p ON u.id = p.usuario_id;

-- CROSS JOIN: Producto cartesiano (cuidado!)
SELECT u.nombre, p.titulo
FROM usuarios u
CROSS JOIN posts p;
\`\`\``,

    indexes: `Índices mejoran el rendimiento de las consultas:

\`\`\`sql
-- Crear índice
CREATE INDEX idx_email ON usuarios(email);

-- Índice único
CREATE UNIQUE INDEX idx_email_unique ON usuarios(email);

-- Índice compuesto
CREATE INDEX idx_nombre_edad ON usuarios(nombre, edad);

-- Ver índices
SHOW INDEX FROM usuarios;

-- Eliminar índice
DROP INDEX idx_email ON usuarios;
\`\`\`

💡 Cuándo usar índices:
- Columnas usadas frecuentemente en WHERE
- Columnas usadas en JOIN
- Columnas usadas en ORDER BY
- Evitar en tablas pequeñas o columnas que cambian frecuentemente`,

    transactions: `Transacciones aseguran que múltiples operaciones se ejecuten como una unidad:

\`\`\`sql
-- Iniciar transacción
START TRANSACTION;

-- Operaciones
UPDATE cuenta SET saldo = saldo - 100 WHERE id = 1;
UPDATE cuenta SET saldo = saldo + 100 WHERE id = 2;

-- Confirmar
COMMIT;

-- O cancelar si hay error
ROLLBACK;
\`\`\`

En código:
\`\`\`javascript
async function transferir(origen, destino, monto) {
  const transaction = await db.transaction();
  
  try {
    await db.query('UPDATE cuenta SET saldo = saldo - ? WHERE id = ?', 
                   [monto, origen], { transaction });
    await db.query('UPDATE cuenta SET saldo = saldo + ? WHERE id = ?', 
                   [monto, destino], { transaction });
    
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
\`\`\``
  },

  // ============================================
  // AUTENTICACIÓN Y SEGURIDAD
  // ============================================
  seguridad: {
    jwt: `JWT (JSON Web Tokens) para autenticación:

\`\`\`javascript
// Generar token
const jwt = require('jsonwebtoken');

function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Verificar token
function verificarToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Token inválido');
  }
}

// Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Sin token' });
  }
  
  try {
    req.user = verificarToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};
\`\`\``,

    bcrypt: `Bcrypt para hashear contraseñas:

\`\`\`javascript
const bcrypt = require('bcrypt');

// Hashear contraseña
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Verificar contraseña
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Uso
const hash = await hashPassword('miPassword123');
const esValida = await verifyPassword('miPassword123', hash); // true
\`\`\``,

    cors: `CORS (Cross-Origin Resource Sharing) permite solicitudes desde otros dominios:

\`\`\`javascript
// Express
const cors = require('cors');

// Permitir todos los orígenes (solo desarrollo)
app.use(cors());

// Configuración específica
app.use(cors({
  origin: 'https://midominio.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Manual
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://midominio.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
\`\`\``,

    xss: `Prevenir XSS (Cross-Site Scripting):

\`\`\`javascript
// Escapar HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Usar librerías
const DOMPurify = require('isomorphic-dompurify');
const clean = DOMPurify.sanitize(userInput);

// React automáticamente escapa
<div>{userInput}</div> // Seguro
<div dangerouslySetInnerHTML={{ __html: userInput }} /> // Peligroso
\`\`\``,

    sqlInjection: `Prevenir SQL Injection:

\`\`\`javascript
// ❌ MAL - Vulnerable
const query = \`SELECT * FROM usuarios WHERE nombre = '\${nombre}'\`;
// Si nombre = "'; DROP TABLE usuarios; --"

// ✅ BIEN - Usar parámetros
const query = 'SELECT * FROM usuarios WHERE nombre = ?';
db.query(query, [nombre]);

// Con ORM (Sequelize)
Usuario.findOne({ where: { nombre } });

// Con Prisma
prisma.usuario.findFirst({ where: { nombre } });
\`\`\``
  },

  // ============================================
  // WEBSOCKETS
  // ============================================
  websocket: {
    socketio: `Socket.IO para comunicación en tiempo real:

\`\`\`javascript
// Servidor
const io = require('socket.io')(server);

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);
  
  // Escuchar evento
  socket.on('mensaje', (data) => {
    console.log('Mensaje recibido:', data);
    
    // Enviar a todos
    io.emit('mensaje', data);
    
    // Enviar a todos excepto el emisor
    socket.broadcast.emit('mensaje', data);
    
    // Enviar solo al emisor
    socket.emit('respuesta', 'Mensaje recibido');
  });
  
  // Unirse a sala
  socket.on('unirse-sala', (sala) => {
    socket.join(sala);
  });
  
  // Enviar a sala específica
  socket.on('mensaje-sala', ({ sala, mensaje }) => {
    io.to(sala).emit('mensaje', mensaje);
  });
  
  socket.on('disconnect', () => {
    console.log('Usuario desconectado');
  });
});

// Cliente
import io from 'socket.io-client';
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Conectado');
  socket.emit('mensaje', 'Hola servidor');
});

socket.on('mensaje', (data) => {
  console.log('Mensaje recibido:', data);
});
\`\`\``
  },

  // ============================================
  // CSS Y HTML
  // ============================================
  css: {
    flexbox: `Flexbox para layouts flexibles:

\`\`\`css
.container {
  display: flex;
  flex-direction: row; /* row | column | row-reverse | column-reverse */
  justify-content: center; /* flex-start | flex-end | center | space-between | space-around */
  align-items: center; /* flex-start | flex-end | center | stretch | baseline */
  flex-wrap: wrap; /* nowrap | wrap | wrap-reverse */
  gap: 20px; /* Espacio entre items */
}

.item {
  flex: 1; /* flex-grow flex-shrink flex-basis */
  flex-grow: 1; /* Crecimiento */
  flex-shrink: 1; /* Encogimiento */
  flex-basis: 200px; /* Tamaño base */
  align-self: flex-start; /* Alineación individual */
}
\`\`\``,

    grid: `CSS Grid para layouts complejos:

\`\`\`css
.container {
  display: grid;
  grid-template-columns: repeat(3, 1fr); /* 3 columnas iguales */
  grid-template-rows: 200px 100px;
  gap: 20px;
  grid-template-areas:
    "header header header"
    "sidebar main main"
    "footer footer footer";
}

.header { grid-area: header; }
.sidebar { grid-area: sidebar; }
.main { grid-area: main; }
.footer { grid-area: footer; }

/* Responsive */
@media (max-width: 768px) {
  .container {
    grid-template-columns: 1fr;
    grid-template-areas:
      "header"
      "main"
      "sidebar"
      "footer";
  }
}
\`\`\``,

    responsive: `Diseño responsive:

\`\`\`css
/* Mobile First */
.container {
  width: 100%;
  padding: 10px;
}

/* Tablet */
@media (min-width: 768px) {
  .container {
    max-width: 750px;
    margin: 0 auto;
    padding: 20px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .container {
    max-width: 1200px;
    padding: 30px;
  }
}

/* Viewport meta tag en HTML */
<meta name="viewport" content="width=device-width, initial-scale=1.0">
\`\`\``
  },

  // ============================================
  // TESTING
  // ============================================
  testing: {
    jest: `Jest para testing en JavaScript:

\`\`\`javascript
// sumar.js
function sumar(a, b) {
  return a + b;
}
module.exports = sumar;

// sumar.test.js
const sumar = require('./sumar');

describe('Función sumar', () => {
  test('suma 1 + 2 = 3', () => {
    expect(sumar(1, 2)).toBe(3);
  });
  
  test('suma números negativos', () => {
    expect(sumar(-1, -2)).toBe(-3);
  });
  
  test('suma cero', () => {
    expect(sumar(0, 5)).toBe(5);
  });
});

// Async testing
test('fetch datos', async () => {
  const datos = await fetchDatos();
  expect(datos).toHaveProperty('id');
});
\`\`\``,

    reactTesting: `Testing de componentes React:

\`\`\`javascript
import { render, screen, fireEvent } from '@testing-library/react';
import Contador from './Contador';

test('incrementa contador al hacer click', () => {
  render(<Contador />);
  
  const boton = screen.getByText('Incrementar');
  const contador = screen.getByText(/Contador:/);
  
  expect(contador).toHaveTextContent('Contador: 0');
  
  fireEvent.click(boton);
  
  expect(contador).toHaveTextContent('Contador: 1');
});
\`\`\``
  },

  // ============================================
  // OPTIMIZACIÓN Y PERFORMANCE
  // ============================================
  performance: {
    debounce: `Debounce limita la frecuencia de ejecución de una función:

\`\`\`javascript
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Uso en búsqueda
const buscar = debounce((termino) => {
  console.log('Buscando:', termino);
}, 300);

input.addEventListener('input', (e) => {
  buscar(e.target.value);
});
\`\`\``,

    throttle: `Throttle garantiza que una función se ejecute como máximo una vez por período:

\`\`\`javascript
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Uso en scroll
const manejarScroll = throttle(() => {
  console.log('Scroll');
}, 100);
\`\`\``,

    lazyLoading: `Lazy loading para mejorar el rendimiento:

\`\`\`javascript
// React
const ComponenteLazy = React.lazy(() => import('./Componente'));

function App() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <ComponenteLazy />
    </Suspense>
  );
}

// Imágenes
<img 
  src="placeholder.jpg" 
  data-src="imagen-real.jpg" 
  loading="lazy"
  onLoad={(e) => {
    e.target.src = e.target.dataset.src;
  }}
/>
\`\`\``
  },

  // ============================================
  // PATRONES DE DISEÑO
  // ============================================
  patrones: {
    singleton: `Patrón Singleton: una sola instancia:

\`\`\`javascript
class Database {
  constructor() {
    if (Database.instance) {
      return Database.instance;
    }
    Database.instance = this;
    return this;
  }
}

// Uso
const db1 = new Database();
const db2 = new Database();
console.log(db1 === db2); // true
\`\`\``,

    factory: `Patrón Factory: crear objetos sin especificar la clase exacta:

\`\`\`javascript
class UsuarioFactory {
  static crear(tipo, datos) {
    switch(tipo) {
      case 'admin':
        return new Admin(datos);
      case 'cliente':
        return new Cliente(datos);
      default:
        throw new Error('Tipo inválido');
    }
  }
}

const admin = UsuarioFactory.crear('admin', { nombre: 'Juan' });
\`\`\``,

    observer: `Patrón Observer: notificar cambios a múltiples observadores:

\`\`\`javascript
class Observable {
  constructor() {
    this.observers = [];
  }
  
  subscribe(observer) {
    this.observers.push(observer);
  }
  
  unsubscribe(observer) {
    this.observers = this.observers.filter(obs => obs !== observer);
  }
  
  notify(data) {
    this.observers.forEach(observer => observer(data));
  }
}

// Uso
const observable = new Observable();
observable.subscribe(data => console.log('Observer 1:', data));
observable.subscribe(data => console.log('Observer 2:', data));
observable.notify('Hola');
\`\`\``
  },

  // ============================================
  // DEBUGGING Y RESOLUCIÓN DE PROBLEMAS
  // ============================================
  debugging: {
    erroresComunes: `Errores comunes y soluciones:

1. **Cannot read property of undefined**
\`\`\`javascript
// ❌ MAL
const nombre = usuario.perfil.nombre;

// ✅ BIEN
const nombre = usuario?.perfil?.nombre; // Optional chaining
const nombre = usuario && usuario.perfil && usuario.perfil.nombre;
\`\`\`

2. **Async/await en loops**
\`\`\`javascript
// ❌ MAL - Secuencial lento
for (const item of items) {
  await procesar(item);
}

// ✅ BIEN - Paralelo rápido
await Promise.all(items.map(item => procesar(item)));
\`\`\`

3. **Memory leaks en React**
\`\`\`javascript
// ❌ MAL - No limpia
useEffect(() => {
  const interval = setInterval(() => {
    // ...
  }, 1000);
});

// ✅ BIEN - Limpia
useEffect(() => {
  const interval = setInterval(() => {
    // ...
  }, 1000);
  return () => clearInterval(interval);
}, []);
\`\`\``,

    herramientas: `Herramientas de debugging:

1. **Console methods**
\`\`\`javascript
console.log('Info');
console.error('Error');
console.warn('Warning');
console.table(array);
console.group('Grupo');
console.time('Timer');
// código...
console.timeEnd('Timer');
\`\`\`

2. **Debugger**
\`\`\`javascript
debugger; // Pausa ejecución aquí
\`\`\`

3. **React DevTools**: Inspeccionar componentes y estado
4. **Chrome DevTools**: Network, Performance, Memory
5. **Redux DevTools**: Para aplicaciones con Redux`
  },

  // ============================================
  // MEJORES PRÁCTICAS GENERALES
  // ============================================
  mejoresPracticas: {
    codigoLimpio: `Código limpio - Principios:

1. **Nombres descriptivos**
\`\`\`javascript
// ❌ MAL
const x = 5;
function fn(a, b) { return a + b; }

// ✅ BIEN
const cantidadProductos = 5;
function sumar(precio1, precio2) { return precio1 + precio2; }
\`\`\`

2. **Funciones pequeñas y específicas**
\`\`\`javascript
// ❌ MAL - Hace muchas cosas
function procesarUsuario(usuario) {
  // validar, guardar, enviar email, log, etc.
}

// ✅ BIEN - Una responsabilidad
function validarUsuario(usuario) { /* ... */ }
function guardarUsuario(usuario) { /* ... */ }
function enviarEmail(usuario) { /* ... */ }
\`\`\`

3. **DRY (Don't Repeat Yourself)**
\`\`\`javascript
// ❌ MAL - Repetido
if (usuario.rol === 'admin') { /* ... */ }
if (producto.rol === 'admin') { /* ... */ }

// ✅ BIEN - Reutilizable
function esAdmin(entidad) {
  return entidad.rol === 'admin';
}
\`\`\`

4. **Manejo de errores**
\`\`\`javascript
try {
  const resultado = await operacionRiesgosa();
} catch (error) {
  console.error('Error específico:', error);
  // Manejar apropiadamente, no solo loggear
  throw new Error('Mensaje útil para el usuario');
}
\`\`\``,

    git: `Git - Comandos esenciales:

\`\`\`bash
# Estado
git status
git log --oneline --graph

# Crear y cambiar ramas
git branch nueva-rama
git checkout nueva-rama
git checkout -b nueva-rama # Crear y cambiar

# Commits
git add .
git commit -m "Mensaje descriptivo"
git commit --amend # Modificar último commit

# Sincronizar
git pull origin main
git push origin main

# Merge
git merge otra-rama

# Revertir cambios
git reset --soft HEAD~1 # Deshacer commit, mantener cambios
git reset --hard HEAD~1 # Deshacer commit y cambios
git revert HEAD # Crear commit que deshace cambios
\`\`\``
  },

  // ============================================
  // RECONOCIMIENTO DE PRODUCTOS E IMÁGENES
  // ============================================
  reconocimiento: {
    productos: `Reconocimiento de Productos - Sistema IXORA:

El sistema de reconocimiento de productos en IXORA funciona de la siguiente manera:

1. **Captura de Imagen**:
   - Puedes usar cámara en vivo, subir foto o video
   - El sistema procesa la imagen para extraer texto y características

2. **Procesamiento de Imagen**:
   - Preprocesamiento: mejora de contraste, reducción de ruido
   - OCR (Reconocimiento Óptico de Caracteres): extrae texto visible
   - Análisis de características: detecta formas, colores, patrones

3. **Búsqueda en Inventario**:
   - El texto extraído se normaliza (sin acentos, minúsculas)
   - Búsqueda flexible por palabras clave en la base de datos
   - Coincidencias por nombre completo o palabras parciales
   - Retorna el producto más similar del inventario

4. **Resultado**:
   - Código del producto (si se encuentra)
   - Nombre del producto
   - Presentación detectada
   - Lote (si está visible)
   - Cantidad (si está visible)

**Ejemplo de uso**:
- "Reconocer este producto" + imagen
- "¿Qué es esto?" + foto
- "Escanear producto" + cámara en vivo

**Mejores prácticas para reconocimiento**:
- Buena iluminación
- Imagen nítida y enfocada
- Texto visible y legible
- Producto centrado en la imagen
- Evitar reflejos y sombras`,

    imagenes: `Reconocimiento de Imágenes - Técnicas:

1. **Preprocesamiento**:
\`\`\`javascript
// Mejorar contraste y nitidez
const imagenMejorada = sharp(imagenBuffer)
  .greyscale() // Escala de grises para OCR
  .normalize() // Normalizar brillo
  .sharpen() // Aumentar nitidez
  .toBuffer();
\`\`\`

2. **Extracción de Texto (OCR)**:
   - Usa Tesseract.js o similar
   - Detecta texto en diferentes idiomas
   - Identifica números, letras, símbolos

3. **Análisis de Características**:
   - Detección de bordes
   - Reconocimiento de formas
   - Análisis de colores dominantes
   - Detección de códigos de barras/QR

4. **Normalización de Texto**:
\`\`\`javascript
function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9\\s]/g, ' ') // Solo letras, números, espacios
    .replace(/\\s+/g, ' ')
    .trim();
}
\`\`\``,

    ocr: `OCR (Reconocimiento Óptico de Caracteres):

**Qué es OCR**:
- Tecnología que convierte texto en imágenes a texto editable
- Detecta letras, números y símbolos en fotos o escaneos

**Proceso**:
1. Preprocesamiento de imagen (mejora de calidad)
2. Segmentación (separar caracteres)
3. Reconocimiento (identificar cada carácter)
4. Post-procesamiento (corrección de errores)

**En IXORA**:
- Extrae nombres de productos de imágenes
- Detecta códigos, lotes, cantidades
- Normaliza el texto para búsqueda en inventario

**Mejores resultados cuando**:
- Texto claro y legible
- Buena resolución
- Contraste adecuado
- Fuente estándar (no manuscrito)
- Orientación correcta`,

    vision: `Visión por Computadora - Conceptos:

**Qué es**:
- Capacidad de las computadoras de "ver" y entender imágenes
- Análisis automático de contenido visual

**Técnicas principales**:
1. **Detección de objetos**: Identificar qué hay en la imagen
2. **Clasificación**: Categorizar el contenido
3. **Segmentación**: Separar diferentes elementos
4. **Reconocimiento de texto**: OCR

**En el contexto de productos**:
- Identificar productos por apariencia
- Leer etiquetas y códigos
- Detectar características (color, forma, tamaño)
- Comparar con base de datos de inventario

**Limitaciones**:
- Depende de calidad de imagen
- Requiere buena iluminación
- Puede confundir productos similares
- Mejor con texto legible`,

    procesamiento: `Procesamiento de Imágenes - Técnicas:

**Operaciones básicas**:

1. **Redimensionar**:
\`\`\`javascript
sharp(imagen)
  .resize(800, 600, { fit: 'inside' })
  .toBuffer();
\`\`\`

2. **Mejorar calidad**:
\`\`\`javascript
sharp(imagen)
  .greyscale() // Escala de grises
  .normalize() // Normalizar brillo
  .sharpen() // Aumentar nitidez
  .contrast(1.2) // Aumentar contraste
  .toBuffer();
\`\`\`

3. **Recortar región**:
\`\`\`javascript
sharp(imagen)
  .extract({ left: 100, top: 100, width: 400, height: 300 })
  .toBuffer();
\`\`\`

4. **Convertir formato**:
\`\`\`javascript
sharp(imagen)
  .jpeg({ quality: 90 })
  .png({ compressionLevel: 9 })
  .toBuffer();
\`\`\`

**Para reconocimiento de productos**:
- Reducir tamaño para procesamiento más rápido
- Mejorar contraste para OCR
- Convertir a escala de grises
- Aplicar filtros de nitidez`
  }
};

// Función inteligente para buscar conocimiento
export function buscarConocimiento(mensaje) {
  const mensajeLower = mensaje.toLowerCase();
  
  // Mapeo de palabras clave a temas
  const mapeo = {
    // React
    'usestate': 'react.useState',
    'use state': 'react.useState',
    'useeffect': 'react.useEffect',
    'use effect': 'react.useEffect',
    'usecontext': 'react.useContext',
    'use context': 'react.useContext',
    'usecallback': 'react.useCallback',
    'use callback': 'react.useCallback',
    'usememo': 'react.useMemo',
    'use memo': 'react.useMemo',
    'useref': 'react.useRef',
    'use ref': 'react.useRef',
    'custom hook': 'react.customHooks',
    'hook personalizado': 'react.customHooks',
    'rendimiento react': 'react.performance',
    'performance react': 'react.performance',
    
    // JavaScript
    'async await': 'javascript.async',
    'promise': 'javascript.promise',
    'closure': 'javascript.closure',
    'clausura': 'javascript.closure',
    'this javascript': 'javascript.this',
    'destructuring': 'javascript.destructuring',
    'desestructuración': 'javascript.destructuring',
    'spread operator': 'javascript.spread',
    'array methods': 'javascript.array',
    'métodos array': 'javascript.array',
    'objetos javascript': 'javascript.objetos',
    'clases javascript': 'javascript.clases',
    
    // Node.js
    'express': 'node.express',
    'middleware': 'node.middleware',
    'router express': 'node.router',
    'async handler': 'node.asyncHandler',
    
    // Bases de datos
    'sql': 'database.sqlBasico',
    'join': 'database.joins',
    'índice': 'database.indexes',
    'index': 'database.indexes',
    'transacción': 'database.transactions',
    'transaction': 'database.transactions',
    
    // Seguridad
    'jwt': 'seguridad.jwt',
    'token': 'seguridad.jwt',
    'bcrypt': 'seguridad.bcrypt',
    'hash password': 'seguridad.bcrypt',
    'cors': 'seguridad.cors',
    'xss': 'seguridad.xss',
    'sql injection': 'seguridad.sqlInjection',
    
    // WebSockets
    'socket.io': 'websocket.socketio',
    'websocket': 'websocket.socketio',
    'tiempo real': 'websocket.socketio',
    
    // CSS
    'flexbox': 'css.flexbox',
    'css grid': 'css.grid',
    'grid': 'css.grid',
    'responsive': 'css.responsive',
    'diseño responsive': 'css.responsive',
    
    // Testing
    'jest': 'testing.jest',
    'test react': 'testing.reactTesting',
    'testing': 'testing.jest',
    
    // Performance
    'debounce': 'performance.debounce',
    'throttle': 'performance.throttle',
    'lazy loading': 'performance.lazyLoading',
    
    // Patrones
    'singleton': 'patrones.singleton',
    'factory': 'patrones.factory',
    'observer': 'patrones.observer',
    
    // Debugging
    'debug': 'debugging.herramientas',
    'error común': 'debugging.erroresComunes',
    'errores comunes': 'debugging.erroresComunes',
    
    // Mejores prácticas
    'mejor práctica': 'mejoresPracticas.codigoLimpio',
    'best practice': 'mejoresPracticas.codigoLimpio',
    'código limpio': 'mejoresPracticas.codigoLimpio',
    'git': 'mejoresPracticas.git',
    
    // Reconocimiento de productos
    'reconocer producto': 'reconocimiento.productos',
    'reconocimiento producto': 'reconocimiento.productos',
    'escanear producto': 'reconocimiento.productos',
    'detectar producto': 'reconocimiento.productos',
    'identificar producto': 'reconocimiento.productos',
    'qué es este producto': 'reconocimiento.productos',
    'que es este producto': 'reconocimiento.productos',
    'reconocimiento imagen': 'reconocimiento.imagenes',
    'reconocimiento de imagen': 'reconocimiento.imagenes',
    'ocr': 'reconocimiento.ocr',
    'reconocimiento texto': 'reconocimiento.ocr',
    'visión computadora': 'reconocimiento.vision',
    'vision computadora': 'reconocimiento.vision',
    'procesamiento imagen': 'reconocimiento.procesamiento'
  };
  
  // Buscar coincidencias
  for (const [keyword, path] of Object.entries(mapeo)) {
    if (mensajeLower.includes(keyword)) {
      const [categoria, tema] = path.split('.');
      if (conocimientosProgramacion[categoria]?.[tema]) {
        return conocimientosProgramacion[categoria][tema];
      }
    }
  }
  
  return null;
}

