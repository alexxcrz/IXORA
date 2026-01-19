import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const normalizeText = (text = '') => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildWakeRegex = (wakeWords) => {
  const words = (wakeWords || []).map((w) => (w || "").trim()).filter(Boolean);
  if (!words.length) return null;
  const group = words.map(escapeRegExp).join("|");
  return new RegExp(`\\b(${group})\\b`, "i");
};

const buildCommandRegexes = (wakeWords, keywords, allowWithoutWakeWord) => {
  const words = (wakeWords || []).map((w) => (w || "").trim()).filter(Boolean);
  const wakeGroup = words.length ? `(?:${words.map(escapeRegExp).join("|")})\\s+` : "";
  const prefix = allowWithoutWakeWord ? `(?:${wakeGroup})?` : wakeGroup;
  return keywords.map((keyword) => {
    return new RegExp(
      `${prefix}(?:${keyword})\\s+(?:si\\s+trata\\s+de\\s+|codigo\\s+)?(\\d+)`,
      "i"
    );
  });
};

/**
 * Hook de reconocimiento de voz para Picking y Surtido Picking
 * @param {Object} options
 * @param {Function} options.onRegistrar
 * @param {Function} options.onSurtir
 * @param {Function} options.onComando
 * @param {boolean} options.enabled
 * @param {string[]} options.wakeWords
 * @param {boolean} options.requireWakeWord
 */
export function useVoiceRecognition({
  onRegistrar,
  onSurtir,
  onComando,
  enabled = true,
  wakeWords = ["ixora", "pina"],
  requireWakeWord = true
}) {
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const isListeningRef = useRef(false);
  const shouldListenRef = useRef(false);
  const isStartingRef = useRef(false);
  const lastResultRef = useRef("");
  const enabledRef = useRef(enabled);

  const onRegistrarRef = useRef(onRegistrar);
  const onSurtirRef = useRef(onSurtir);
  const onComandoRef = useRef(onComando);

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    onRegistrarRef.current = onRegistrar;
    onSurtirRef.current = onSurtir;
    onComandoRef.current = onComando;
  }, [onRegistrar, onSurtir, onComando]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      shouldListenRef.current = false;
      setIsListening(false);
    }
  }, [enabled]);

  const wakeRegex = useMemo(() => buildWakeRegex(wakeWords), [wakeWords]);
  const registrarRegexes = useMemo(
    () => buildCommandRegexes(wakeWords, ["registra", "registrar"], !requireWakeWord),
    [wakeWords, requireWakeWord]
  );
  const surtirRegexes = useMemo(
    () => buildCommandRegexes(wakeWords, ["surte", "surtir"], !requireWakeWord),
    [wakeWords, requireWakeWord]
  );

  const detenerStream = useCallback(() => {
    if (!streamRef.current) return;
    try {
      streamRef.current.getTracks().forEach((track) => track.stop());
    } catch (e) {}
    streamRef.current = null;
  }, []);

  const crearReconocimiento = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "es-ES";

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setError(null);
    };

    recognition.onend = () => {
      setIsListening(false);
      isListeningRef.current = false;

      if (!enabledRef.current || !shouldListenRef.current) return;
      setTimeout(() => {
        try {
          recognitionRef.current?.start();
        } catch (e) {}
      }, 250);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Permiso de micrófono denegado. Permite el acceso al micrófono.");
        shouldListenRef.current = false;
        detenerStream();
        return;
      }
      if (event.error === "aborted") {
        if (shouldListenRef.current) {
          setTimeout(() => {
            try {
              recognitionRef.current?.start();
            } catch (e) {}
          }, 500);
        }
        return;
      }
      setError(`Error de reconocimiento: ${event.error}`);
    };

    recognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex]?.[0]?.transcript || "";
      const normalizado = normalizeText(transcript);
      if (!normalizado) return;

      if (normalizado === lastResultRef.current) return;
      lastResultRef.current = normalizado;

      const hasWakeWord = wakeRegex ? wakeRegex.test(normalizado) : true;
      if (requireWakeWord && !hasWakeWord) return;

      if (onRegistrarRef.current) {
        for (const patron of registrarRegexes) {
          const match = normalizado.match(patron);
          if (match?.[1]) {
            onRegistrarRef.current(match[1]);
            return;
          }
        }
      }

      if (onSurtirRef.current) {
        for (const patron of surtirRegexes) {
          const match = normalizado.match(patron);
          if (match?.[1]) {
            onSurtirRef.current(match[1]);
            return;
          }
        }
      }

      if (onComandoRef.current) {
        onComandoRef.current(transcript, normalizado);
      }
    };

    return recognition;
  }, [detenerStream, registrarRegexes, requireWakeWord, surtirRegexes, wakeRegex]);

  const solicitarPermisoMicrofono = useCallback(async () => {
    const isSecure =
      window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isSecure) {
      throw new Error("Se necesita HTTPS o localhost para acceder al micrófono.");
    }

    const getUserMedia =
      navigator.mediaDevices?.getUserMedia ||
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    if (!getUserMedia) {
      throw new Error("getUserMedia no está disponible en este dispositivo.");
    }

    if (navigator.mediaDevices?.getUserMedia) {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }

    return new Promise((resolve, reject) => {
      getUserMedia.call(navigator, { audio: true }, resolve, reject);
    });
  }, []);

  const start = useCallback(async () => {
    if (!enabledRef.current) return;
    if (isStartingRef.current || isListeningRef.current) return;

    isStartingRef.current = true;
    setError(null);

    try {
      if (!recognitionRef.current) {
        recognitionRef.current = crearReconocimiento();
      }

      if (!recognitionRef.current) {
        setError("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.");
        return;
      }

      if (!streamRef.current) {
        streamRef.current = await solicitarPermisoMicrofono();
      }

      shouldListenRef.current = true;
      recognitionRef.current.start();
    } catch (err) {
      const nombre = err?.name || "";
      if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError") {
        setError("Permiso de micrófono denegado. Permite el acceso al micrófono.");
      } else if (nombre === "NotFoundError" || nombre === "DevicesNotFoundError") {
        setError("No se encontró ningún micrófono. Verifica que esté conectado.");
      } else if (nombre === "NotReadableError" || nombre === "TrackStartError") {
        setError("El micrófono está siendo usado por otra aplicación.");
      } else {
        setError(err?.message || "No se pudo acceder al micrófono.");
      }
      shouldListenRef.current = false;
      detenerStream();
    } finally {
      isStartingRef.current = false;
    }
  }, [crearReconocimiento, detenerStream, solicitarPermisoMicrofono]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    detenerStream();
    setIsListening(false);
    isListeningRef.current = false;
  }, [detenerStream]);

  const toggle = useCallback(() => {
    if (isListeningRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  useEffect(() => {
    if (!enabled) {
      stop();
    }
  }, [enabled, stop]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
      detenerStream();
    };
  }, [detenerStream]);

  return {
    isListening,
    error,
    start,
    stop,
    toggle
  };
}
