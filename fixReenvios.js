#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'server/src/rutas/reenvios.js');

// Leer el archivo
let content = fs.readFileSync(filePath, 'utf-8');

const originalContent = content;

// Estrategia: Reemplazar getIO().emit("reenvios_actualizados") y siguientes líneas
// con la función notificarActualizacionReenvio más específica

// Patrón 1: Cuando se crea un nuevo reenvío (línea ~167)
// getIO().emit("reenvios_actualizados");
// getIO().emit("reportes_actualizados");
// res.json({ ok: true, id: info.lastInsertRowid });
// Convertir a: notificarActualizacionReenvio(info.lastInsertRowid, "agregado");

content = content.replace(
  /getIO\(\)\.emit\("reenvios_actualizados"\);\s*getIO\(\)\.emit\("reportes_actualizados"\);\s*res\.json\(\s*\{\s*ok:\s*true,\s*id:\s*info\.lastInsertRowid\s*\}\s*\);/g,
  `// Emitir evento granular de nuevo reenvío
    notificarActualizacionReenvio(info.lastInsertRowid, "agregado");
    res.json({ ok: true, id: info.lastInsertRowid });`
);

// Patrón 2: Reemplazos simples de getIO().emit("reenvios_actualizados") + getIO().emit("reportes_actualizados")
// Pero debe obtener el ID del contexto
content = content.replace(
  /getIO\(\)\.emit\("reenvios_actualizados"\);\s*getIO\(\)\.emit\("reportes_actualizados"\);/g,
  `// Emitir eventos de sincronización granular
    notificarActualizacionReenvio(req.params.id || ${1}, "actualizado");`
);

// Patrón 3: Solo getIO().emit("reenvios_actualizados") sin reportes_actualizados
content = content.replace(
  /getIO\(\)\.emit\("reenvios_actualizados"\);\s*(?!getIO)/g,
  `// Emitir evento granular de actualización
    notificarActualizacionReenvio(req.params.id || tokenData.registro_id || reenvioId, "actualizado");\n`
);

const changeCount = (originalContent.match(/getIO\(\)\.emit\("reenvios_actualizados"\)/g) || []).length - 
                   (content.match(/getIO\(\)\.emit\("reenvios_actualizados"\)/g) || []).length;

console.log(`✅ Reemplazadas ${changeCount} ocurrencias de getIO().emit("reenvios_actualizados")`);

// Escribir el archivo actualizado
fs.writeFileSync(filePath, content, 'utf-8');

console.log('📝 Archivo actualizado exitosamente');
