import { useEffect, useRef } from "react";
import { reproducirSonidoIxora } from "../utils/sonidoIxora";

/**
 * Hook para monitorear reuniones próximas y programar alertas audiovisuales
 * - Alerta 10 minutos antes de la reunión
 * - Alerta a la hora exacta de la reunión
 */
export function useAlertasReuniones(reunionesProximas, configNotif, showAlert) {
  const timersRef = useRef(new Map()); // Map<reunionId, {timer10min, timerHora}>
  const alertasEmitidasRef = useRef(new Set()); // Set para evitar alertas duplicadas

  useEffect(() => {
    if (!reunionesProximas || reunionesProximas.length === 0) {
      // Limpiar todos los timers si no hay reuniones
      timersRef.current.forEach((timers) => {
        if (timers.timer10min) clearTimeout(timers.timer10min);
        if (timers.timerHora) clearTimeout(timers.timerHora);
      });
      timersRef.current.clear();
      alertasEmitidasRef.current.clear();
      return;
    }

    const ahora = new Date();
    const ahoraMs = ahora.getTime();

    reunionesProximas.forEach((reunion) => {
      if (!reunion.fecha || !reunion.hora) return;

      try {
        // Crear fecha/hora de la reunión
        const [anio, mes, dia] = reunion.fecha.split("-");
        const [hora, minuto] = reunion.hora.split(":");
        const fechaReunion = new Date(
          parseInt(anio),
          parseInt(mes) - 1,
          parseInt(dia),
          parseInt(hora),
          parseInt(minuto),
          0
        );
        const fechaReunionMs = fechaReunion.getTime();

        // Si la reunión ya pasó, ignorar
        if (fechaReunionMs <= ahoraMs) return;

        // Calcular tiempos para las alertas
        const tiempoHastaReunion = fechaReunionMs - ahoraMs;
        const tiempo10MinAntes = tiempoHastaReunion - 10 * 60 * 1000; // 10 minutos en ms
        const tiempoHoraExacta = tiempoHastaReunion;

        // Si ya hay timers para esta reunión, limpiarlos primero
        if (timersRef.current.has(reunion.id)) {
          const timersExistentes = timersRef.current.get(reunion.id);
          if (timersExistentes.timer10min) clearTimeout(timersExistentes.timer10min);
          if (timersExistentes.timerHora) clearTimeout(timersExistentes.timerHora);
        }

        const timers = {};

        // Programar alerta 10 minutos antes (solo si faltan más de 10 minutos)
        if (tiempo10MinAntes > 0) {
          const key10min = `${reunion.id}-10min`;
          if (!alertasEmitidasRef.current.has(key10min)) {
            timers.timer10min = setTimeout(() => {
              alertasEmitidasRef.current.add(key10min);
              
              // Reproducir sonido
              if (configNotif?.sonido_activo !== 0) {
                reproducirSonidoIxora(configNotif?.sonido_mensaje || "ixora-alert");
                // Reproducir dos veces para que sea más notorio
                setTimeout(() => {
                  reproducirSonidoIxora(configNotif?.sonido_mensaje || "ixora-alert");
                }, 500);
              }

              // Mostrar alerta visual
              if (showAlert) {
                showAlert(
                  `⏰ Reunión en 10 minutos: "${reunion.titulo}"\n\n📅 ${reunion.fecha} a las ${reunion.hora}${reunion.lugar ? `\n📍 ${reunion.lugar}` : ""}`,
                  "warning"
                );
              }

              // Notificación del navegador si está disponible
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`⏰ Reunión en 10 minutos: ${reunion.titulo}`, {
                  body: `${reunion.fecha} a las ${reunion.hora}${reunion.lugar ? ` - ${reunion.lugar}` : ""}`,
                  icon: "/favicon.ico",
                  tag: `reunion-10min-${reunion.id}`,
                  requireInteraction: false,
                });
              }
            }, tiempo10MinAntes);
          }
        }

        // Programar alerta a la hora exacta
        const keyHora = `${reunion.id}-hora`;
        if (!alertasEmitidasRef.current.has(keyHora)) {
          timers.timerHora = setTimeout(() => {
            alertasEmitidasRef.current.add(keyHora);
            
            // Reproducir sonido más intenso
            if (configNotif?.sonido_activo !== 0) {
              reproducirSonidoIxora("ixora-call");
              setTimeout(() => {
                reproducirSonidoIxora("ixora-call");
              }, 500);
              setTimeout(() => {
                reproducirSonidoIxora("ixora-call");
              }, 1000);
            }

            // Mostrar alerta visual
            if (showAlert) {
              showAlert(
                `🔔 ¡Es hora de la reunión!\n\n"${reunion.titulo}"\n\n📅 ${reunion.fecha} a las ${reunion.hora}${reunion.lugar ? `\n📍 ${reunion.lugar}` : ""}${reunion.es_videollamada && reunion.link_videollamada ? `\n🔗 ${reunion.link_videollamada}` : ""}`,
                "info"
              );
            }

            // Notificación del navegador si está disponible
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`🔔 ¡Es hora de la reunión: ${reunion.titulo}`, {
                body: `${reunion.fecha} a las ${reunion.hora}${reunion.lugar ? ` - ${reunion.lugar}` : ""}`,
                icon: "/favicon.ico",
                tag: `reunion-hora-${reunion.id}`,
                requireInteraction: true,
              });
            }
          }, tiempoHoraExacta);
        }

        timersRef.current.set(reunion.id, timers);
      } catch (error) {
        console.error(`Error programando alertas para reunión ${reunion.id}:`, error);
      }
    });

    // Cleanup: limpiar timers cuando el componente se desmonte o cambien las reuniones
    return () => {
      timersRef.current.forEach((timers) => {
        if (timers.timer10min) clearTimeout(timers.timer10min);
        if (timers.timerHora) clearTimeout(timers.timerHora);
      });
    };
  }, [reunionesProximas, configNotif, showAlert]);

  // Solicitar permisos de notificación al montar el hook
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        // Ignorar errores silenciosamente
      });
    }
  }, []);
}
