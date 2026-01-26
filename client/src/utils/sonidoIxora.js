/**
 * ÚNICO punto de reproducción de sonidos en el sistema.
 * Solo el sonido elegido en el modal de notificaciones se usa en chat y campanita.
 * Un solo AudioContext para evitar mezclas.
 */

export const SONIDO_PATTERNS = {
  "ixora-pulse": { type: "sine", notes: [{ f: 520, d: 0.12 }, { f: 650, d: 0.12 }, { f: 520, d: 0.12 }] },
  "ixora-wave": { type: "triangle", notes: [{ f: 440, d: 0.18 }, { f: 520, d: 0.18 }] },
  "ixora-alert": { type: "square", notes: [{ f: 740, d: 0.1 }, { f: 740, d: 0.1 }, { f: 880, d: 0.18 }] },
  "ixora-call": { type: "sine", notes: [{ f: 620, d: 0.45 }, { f: 540, d: 0.45 }, { f: 620, d: 0.45 }] },
  "ixora-call-group": { type: "sine", notes: [{ f: 600, d: 0.5 }, { f: 520, d: 0.5 }, { f: 600, d: 0.5 }] },
  "ixora-soft": { type: "sine", notes: [{ f: 360, d: 0.2 }, { f: 420, d: 0.2 }] },
  "ixora-digital": { type: "square", notes: [{ f: 880, d: 0.08 }, { f: 990, d: 0.08 }, { f: 880, d: 0.08 }, { f: 1180, d: 0.12 }] },
  "ixora-picking": { type: "triangle", notes: [{ f: 500, d: 0.1 }, { f: 600, d: 0.1 }, { f: 500, d: 0.1 }] },
  "ixora-surtido": { type: "sine", notes: [{ f: 660, d: 0.16 }, { f: 780, d: 0.16 }, { f: 720, d: 0.18 }] },
};

let ctx = null;
let activado = false;

function getContext() {
  const C = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!C) return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new C();
  }
  return ctx;
}

/**
 * Activar contexto en la primera interacción (requerido por navegadores).
 * Llamar una vez al montar la app (p. ej. en App.jsx).
 */
export function activarContextoEnPrimeraInteraccion() {
  if (activado) return;
  activado = true;
  const fn = () => {
    const c = getContext();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  };
  ["click", "touchstart", "keydown", "mousedown"].forEach((ev) => {
    document.addEventListener(ev, fn, { once: true, passive: true });
  });
}

let playingUntil = 0;

/**
 * Reproduce el sonido elegido en el modal de notificaciones.
 * Es el ÚNICO lugar donde se reproduce sonido para chat y notificaciones.
 * @param {string} soundKey - Clave (ej. "ixora-pulse", "silencio"). Usar sonido_mensaje de la config.
 */
export function reproducirSonidoIxora(soundKey = "ixora-pulse") {
  if (!soundKey || soundKey === "silencio") return;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (now < playingUntil) return;
  const pattern = SONIDO_PATTERNS[soundKey] || SONIDO_PATTERNS["ixora-pulse"];
  if (!pattern) return;
  try {
    const c = getContext();
    if (!c) return;
    const duration = pattern.notes.reduce((s, n) => s + n.d, 0) + 0.1;
    playingUntil = now + duration * 1000;
    const run = () => {
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.connect(c.destination);
      let t = c.currentTime + 0.02;
      pattern.notes.forEach((note, idx) => {
        const osc = c.createOscillator();
        osc.type = pattern.type;
        osc.frequency.setValueAtTime(note.f, t);
        osc.connect(gain);
        const attack = 0.02;
        const release = 0.08;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.18, t + attack);
        gain.gain.linearRampToValueAtTime(0.0001, t + note.d - release);
        osc.start(t);
        osc.stop(t + note.d);
        t += note.d + (idx === pattern.notes.length - 1 ? 0 : 0.04);
      });
    };
    if (c.state === "suspended") {
      c.resume().then(run).catch(() => {});
    } else {
      run();
    }
  } catch (_) {}
}
