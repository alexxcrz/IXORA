#!/usr/bin/env python3
"""
Script para generar sonidos únicos de PINA
Requiere: numpy, scipy, soundfile
Instalar: pip install numpy scipy soundfile
"""

try:
    import numpy as np
    from scipy.io import wavfile
    import os
    
    def generar_sonido_chat():
        """Genera un sonido único para chat de PINA"""
        sample_rate = 44100
        duracion = 0.6  # segundos
        
        t = np.linspace(0, duracion, int(sample_rate * duracion))
        
        # Crear un tono único con múltiples frecuencias
        frecuencia1 = 800  # Hz
        frecuencia2 = 1200  # Hz
        frecuencia3 = 1600  # Hz
        
        # Generar onda con envolvente ADSR
        onda = np.sin(2 * np.pi * frecuencia1 * t)
        onda += 0.5 * np.sin(2 * np.pi * frecuencia2 * t)
        onda += 0.3 * np.sin(2 * np.pi * frecuencia3 * t)
        
        # Aplicar envolvente (fade in y fade out)
        fade_samples = int(0.1 * sample_rate)
        envolvente = np.ones_like(onda)
        envolvente[:fade_samples] = np.linspace(0, 1, fade_samples)
        envolvente[-fade_samples:] = np.linspace(1, 0, fade_samples)
        
        onda *= envolvente
        
        # Normalizar
        onda = onda / np.max(np.abs(onda)) * 0.7
        
        return (sample_rate, onda)
    
    def generar_sonido_notificacion():
        """Genera un sonido único para notificaciones de PINA"""
        sample_rate = 44100
        duracion = 0.8  # segundos
        
        t = np.linspace(0, duracion, int(sample_rate * duracion))
        
        # Crear un tono diferente con frecuencias distintas
        frecuencia1 = 600  # Hz
        frecuencia2 = 1000  # Hz
        
        # Generar onda con patrón diferente
        onda = np.sin(2 * np.pi * frecuencia1 * t)
        onda += 0.7 * np.sin(2 * np.pi * frecuencia2 * t)
        
        # Aplicar modulación de frecuencia para hacerlo más interesante
        modulacion = np.sin(2 * np.pi * 5 * t) * 0.3
        onda *= (1 + modulacion)
        
        # Aplicar envolvente
        fade_samples = int(0.15 * sample_rate)
        envolvente = np.ones_like(onda)
        envolvente[:fade_samples] = np.linspace(0, 1, fade_samples)
        envolvente[-fade_samples:] = np.linspace(1, 0, fade_samples)
        
        onda *= envolvente
        
        # Normalizar
        onda = onda / np.max(np.abs(onda)) * 0.7
        
        return (sample_rate, onda)
    
    def convertir_a_mp3(wav_file, mp3_file):
        """Convierte WAV a MP3 usando ffmpeg si está disponible"""
        import subprocess
        try:
            subprocess.run(['ffmpeg', '-i', wav_file, '-codec:a', 'libmp3lame', '-qscale:a', '2', mp3_file], 
                         check=True, capture_output=True)
            os.remove(wav_file)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"ffmpeg no disponible. Guardando como WAV: {wav_file}")
            return False
    
    # Generar sonidos
    print("Generando sonido de chat...")
    sr_chat, audio_chat = generar_sonido_chat()
    wavfile.write('pina_chat_temp.wav', sr_chat, (audio_chat * 32767).astype(np.int16))
    
    print("Generando sonido de notificación...")
    sr_notif, audio_notif = generar_sonido_notificacion()
    wavfile.write('pina_notification_temp.wav', sr_notif, (audio_notif * 32767).astype(np.int16))
    
    # Intentar convertir a MP3
    print("Convirtiendo a MP3...")
    if convertir_a_mp3('pina_chat_temp.wav', 'pina_chat.mp3'):
        print("✓ pina_chat.mp3 creado")
    else:
        os.rename('pina_chat_temp.wav', 'pina_chat.wav')
        print("✓ pina_chat.wav creado (convierte a MP3 manualmente)")
    
    if convertir_a_mp3('pina_notification_temp.wav', 'pina_notification.mp3'):
        print("✓ pina_notification.mp3 creado")
    else:
        os.rename('pina_notification_temp.wav', 'pina_notification.wav')
        print("✓ pina_notification.wav creado (convierte a MP3 manualmente)")
    
    print("\n¡Sonidos generados exitosamente!")
    
except ImportError as e:
    print(f"Error: Faltan dependencias. Instala con: pip install numpy scipy soundfile")
    print(f"Detalle: {e}")
except Exception as e:
    print(f"Error al generar sonidos: {e}")
