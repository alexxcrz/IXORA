import dotenv from "dotenv";

// Suprimir mensajes informativos de dotenv
const originalLog = console.log;
console.log = (...args) => {
  const message = args.join(' ');
  // Filtrar mensajes de dotenv sobre inyección de variables y tips
  if (message.includes('[dotenv@') && (message.includes('injecting env') || message.includes('tip:'))) {
    return; // No mostrar estos mensajes
  }
  originalLog(...args);
};

dotenv.config();

// Restaurar console.log después de cargar dotenv
setTimeout(() => {
  console.log = originalLog;
}, 10);
