# Sonidos Únicos de IXORA

Este directorio necesita dos sonidos únicos para IXORA:

## Sonidos Requeridos:

1. **ixora_chat.mp3** - Sonido para notificaciones de chat
   - Debe ser único y distintivo
   - Duración recomendada: 0.5-1 segundo
   - Volumen: moderado

2. **ixora_notification.mp3** - Sonido para notificaciones generales
   - Debe ser diferente al sonido de chat
   - Duración recomendada: 0.5-1 segundo
   - Volumen: moderado

## Instrucciones para Crear los Sonidos:

### Opción 1: Usar herramientas online
- Visita https://www.zapsplat.com o https://freesound.org
- Busca sonidos de notificación únicos
- Descarga y renombra como `ixora_chat.mp3` y `ixora_notification.mp3`

### Opción 2: Usar Audacity
1. Abre Audacity
2. Genera un tono único (Efectos > Generar > Tono)
3. Añade efectos para hacerlo único (reverb, delay, etc.)
4. Exporta como MP3
5. Renombra según corresponda

### Opción 3: Usar el script Python (si tienes numpy y scipy instalados)
```bash
python crear_sonidos_ixora.py
```

## Nota Temporal:

Mientras se crean los sonidos únicos, el sistema usará `chat_notif.mp3` como fallback.
