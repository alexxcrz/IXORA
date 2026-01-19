/**
 * Helper para detectar si hay modales o chat abierto
 * Evita que el auto-focus interfiera con la interacción del usuario
 */
export const puedeHacerFocus = () => {
  // Verificar si hay chat abierto
  const chatAbierto = document.querySelector('.chat-pro-ventana') && 
                      window.getComputedStyle(document.querySelector('.chat-pro-ventana')).display !== 'none';
  
  // Verificar si hay modales abiertos
  const modalesAbiertos = document.querySelectorAll('.devModalFondo, .activation-modal, .modal-duplicado, .modal-overlay, .modal-overlay-picking, [class*="modal"]');
  const hayModalAbierto = Array.from(modalesAbiertos).some(modal => {
    const style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
  
  // Verificar si hay un input o textarea activo y editable (usuario escribiendo)
  const elementoActivo = document.activeElement;
  const inputActivo = elementoActivo && (
    (elementoActivo.tagName === 'INPUT' && !elementoActivo.readOnly && elementoActivo.id !== 'inputCodigo') ||
    (elementoActivo.tagName === 'TEXTAREA' && !elementoActivo.readOnly) ||
    elementoActivo.isContentEditable
  );
  
  // Solo hacer focus si no hay chat, no hay modales y no hay inputs activos/editables
  return !chatAbierto && !hayModalAbierto && !inputActivo;
};

/**
 * Hace focus en un elemento solo si es seguro hacerlo
 */
export const safeFocus = (element, delay = 100) => {
  if (!element) return;
  
  setTimeout(() => {
    if (puedeHacerFocus()) {
      try {
        element.focus({ preventScroll: true });
      } catch (e) {
        // Ignorar errores de focus
      }
    }
  }, delay);
};




