import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "../../AuthContext";
import "./Administrador.css";
import Personalizacion from "./Personalizacion";
import { useAlert } from "../../components/AlertModal";
import ConfirmationCodeModal from "../../components/ConfirmationCodeModal";

const TAB_LABELS = {
  "tab:escaneo": "Picking🔎",
  "tab:registros": "Registros Picking🗃️",
  "tab:devoluciones": "Devoluciones🚚",
  "tab:reenvios": "Reenvíos📨",
  "tab:reportes": "Reportes Picking📝",
  "tab:rep_devol": "Reportes Devoluciones📝",
  "tab:rep_reenvios": "Reportes Reenvíos📝",
  "tab:inventario": "Inventario📋",
  "tab:activaciones": "Activaciones⚡",
  "tab:rep_activaciones": "Reportes Activaciones📊",
  "tab:admin": "CEO👑",
  "tab:ixora_ia": "IXORA IA✨",
  "tab:auditoria": "Auditoría🔍",
  "tab:activos": "Activos Informáticos💻",
};

// Mapeo completo de permisos por módulo
const PERMISOS_POR_MODULO = {
  "picking": {
    "picking.escaneo": "Escanear productos",
    "picking.surtir": "Marcar como surtido",
    "picking.agregar": "Agregar productos",
    "picking.eliminar": "Eliminar productos",
    "picking.editar": "Editar productos",
    "picking.observaciones": "Agregar observaciones",
  },
  "registros": {
    "registros.ver": "Ver registros",
    "registros.crear": "Crear registro",
    "registros.editar": "Editar registros",
    "registros.eliminar": "Eliminar registros",
    "registros.activar": "Activar/desactivar",
    "registros.exportar": "Exportar registros",
  },
  "devoluciones": {
    "devoluciones.ver": "Ver devoluciones",
    "devoluciones.crear": "Crear devolución",
    "devoluciones.editar": "Editar devoluciones",
    "devoluciones.eliminar": "Eliminar devoluciones",
    "devoluciones.procesar": "Procesar devoluciones",
    "devoluciones.fotos": "Subir/ver fotos",
    "devoluciones.control_calidad": "Control de calidad",
    "devoluciones.exportar": "Exportar devoluciones",
  },
  "reenvios": {
    "reenvios.ver": "Ver reenvíos",
    "reenvios.crear": "Crear reenvío",
    "reenvios.editar": "Editar reenvíos",
    "reenvios.eliminar": "Eliminar reenvíos",
    "reenvios.actualizar_estatus": "Actualizar estatus",
    "reenvios.evidencia": "Subir evidencia",
    "reenvios.exportar": "Exportar reenvíos",
  },
  "reportes": {
    "reportes.ver": "Ver reportes",
    "reportes.cerrar_dia": "Cerrar día",
    "reportes.mover": "Mover reportes",
    "reportes.eliminar": "Eliminar reportes",
    "reportes.exportar": "Exportar reportes",
    "reportes.detalle": "Ver detalle",
  },
  "rep_devol": {
    "rep_devol.ver": "Ver reportes",
    "rep_devol.exportar": "Exportar reportes",
    "rep_devol.filtrar": "Filtrar reportes",
    "rep_devol.detalle": "Ver detalle",
  },
  "rep_reenvios": {
    "rep_reenvios.ver": "Ver reportes",
    "rep_reenvios.exportar": "Exportar reportes",
    "rep_reenvios.filtrar": "Filtrar reportes",
    "rep_reenvios.detalle": "Ver detalle",
  },
  "activaciones": {
    "activaciones.ver": "Ver activaciones",
    "activaciones.crear": "Crear activaciones",
    "activaciones.editar": "Editar activaciones",
    "activaciones.eliminar": "Eliminar activaciones",
    "activaciones.cerrar_dia": "Cerrar día",
  },
  "rep_activaciones": {
    "rep_activaciones.ver": "Ver reportes",
    "rep_activaciones.exportar": "Exportar reportes",
    "rep_activaciones.filtrar": "Filtrar reportes",
    "rep_activaciones.detalle": "Ver detalle",
    "rep_activaciones.eliminar": "Eliminar días",
  },
  "inventario": {
    "inventario.ver": "Ver inventario",
    "inventario.crear": "Crear productos",
    "inventario.editar": "Editar productos",
    "inventario.eliminar": "Eliminar productos",
    "inventario.lotes": "Gestionar lotes",
    "inventario.activar_lotes": "Activar/desactivar lotes",
    "inventario.mostrar_en_pagina": "Agregar/quitar de tienda",
    "inventario.activar_productos": "Activar/desactivar productos",
    "inventario.crear_inventario": "Crear nuevos inventarios",
    "inventario.ajustes": "Ajustes de inventario",
    "inventario.exportar": "Exportar inventario",
    "inventario.importar": "Importar productos",
  },
  "admin": {
    "admin.usuarios.ver": "Ver usuarios",
    "admin.usuarios.crear": "Crear usuarios",
    "admin.usuarios.editar": "Editar usuarios",
    "admin.usuarios.eliminar": "Borrar usuarios",
    "admin.roles.ver": "Ver roles",
    "admin.roles.crear": "Crear roles",
    "admin.roles.editar": "Editar roles",
    "admin.roles.eliminar": "Borrar roles",
    "admin.permisos.ver": "Ver permisos",
    "admin.permisos.asignar": "Asignar permisos",
    "admin.sesiones.ver": "Ver sesiones",
    "admin.sesiones.cerrar": "Cerrar sesiones",
    "admin.sesiones.cerrar_todas": "Cerrar todas las sesiones",
    "admin.confirmacion.recibir_codigos": "Recibir códigos de confirmación",
    "admin.fotos.subir": "Subir fotos de perfil",
    "admin.actividad.registrar": "Registrar actividad",
    "admin.actividad.ver": "Ver auditoría",
    "admin.personalizacion.ver": "Ver personalización",
    "admin.personalizacion.editar": "Editar personalización",
  },
  "ixora_ia": {
    "ixora_ia.chat": "Usar chat",
    "ixora_ia.comandos_voz": "Comandos de voz",
    "ixora_ia.reconocimiento": "Reconocimiento de imágenes",
    "ixora_ia.generar_imagen": "Generar imágenes",
    "ixora_ia.reportes": "Generar reportes",
  },
  "tienda": {
    "tienda.ver": "Ver tienda",
    "tienda.productos.ver": "Ver productos",
    "tienda.productos.crear": "Crear productos",
    "tienda.productos.editar": "Editar productos",
    "tienda.productos.eliminar": "Eliminar productos",
    "tienda.pedidos.ver": "Ver pedidos",
    "tienda.pedidos.procesar": "Procesar pedidos",
    "tienda.pedidos.cancelar": "Cancelar pedidos",
    "tienda.configurar": "Configurar tienda",
    "tienda.exportar": "Exportar datos",
  },
  "activos": {
    "activos.ver": "Ver activos",
    "activos.crear": "Crear activos",
    "activos.editar": "Editar activos",
    "activos.eliminar": "Eliminar activos",
    "activos.responsables.ver": "Ver responsables",
    "activos.responsables.crear": "Crear responsables",
    "activos.responsables.editar": "Editar responsables",
    "activos.responsables.eliminar": "Eliminar responsables",
    "activos.tablets.ver": "Ver tablets",
    "activos.tablets.crear": "Crear tablets",
    "activos.tablets.editar": "Editar tablets",
    "activos.tablets.eliminar": "Eliminar tablets",
    "activos.exportar": "Exportar activos",
  },
  "auditoria": {
    "auditoria.ver": "Ver auditoría",
    "auditoria.registros.ver": "Ver registros de auditoría",
    "auditoria.registros.exportar": "Exportar registros",
    "auditoria.inventario.crear": "Crear auditoría de inventario",
    "auditoria.inventario.editar": "Editar auditoría de inventario",
    "auditoria.inventario.eliminar": "Eliminar auditoría de inventario",
    "auditoria.inventario.finalizar": "Finalizar auditoría de inventario",
    "auditoria.filtrar": "Filtrar auditoría",
  },
};

// Labels para permisos de admin (mantener compatibilidad)
const ADMIN_PERM_LABELS = {
  "admin.usuarios.ver": "Ver usuarios",
  "admin.usuarios.crear": "Crear usuarios",
  "admin.usuarios.editar": "Editar usuarios",
  "admin.usuarios.borrar": "Borrar usuarios",
  "admin.roles.ver": "Ver roles",
  "admin.roles.crear": "Crear roles",
  "admin.roles.borrar": "Borrar roles",
  "admin.permisos.ver": "Ver permisos",
  "admin.permisos.asignar": "Asignar permisos",
  "admin.sesiones.ver": "Ver sesiones",
  "admin.sesiones.cerrar": "Cerrar sesiones",
  "admin.sesiones.cerrar_todas": "Cerrar todas las sesiones",
  "admin.fotos.subir": "Subir fotos de perfil",
  "admin.actividad.registrar": "Registrar actividad",
  "admin.senior": "CEO Senior",
  "admin.junior": "CEO Junior",
};

// Orden de las pestañas (igual al menú)
const TAB_ORDER = [
  "tab:escaneo",
  "tab:registros",
  "tab:devoluciones",
  "tab:reenvios",
  "tab:reportes",
  "tab:rep_devol",
  "tab:rep_reenvios",
  "tab:inventario",
  "tab:activaciones",
  "tab:rep_activaciones",
  "tab:auditoria",
  "tab:activos",
  "tab:admin",
  "tab:ixora_ia",
];

// Permisos obsoletos que deben ser filtrados
const PERMISOS_OBSOLETOS = [
  "tab:compras",
  "tab:contabilidad",
  "tab:crm",
  "tab:dashboard",
  "tab:produccion",
  "tab:rrhh",
];

// Detectar tabs y permisos organizados por módulo
const detectarTabsYPermisos = (permsAll) => {
  // Filtrar permisos obsoletos
  const permisosFiltrados = permsAll.filter(p => !PERMISOS_OBSOLETOS.includes(p));
  
  const tabs = permisosFiltrados.filter((p) => p.startsWith("tab:"));
  const adminPerms = permisosFiltrados.filter((p) => p.startsWith("admin."));
  
  // Organizar permisos por módulo
  const permisosPorModulo = {};
  Object.keys(PERMISOS_POR_MODULO).forEach((modulo) => {
    permisosPorModulo[modulo] = permisosFiltrados.filter((p) => 
      Object.keys(PERMISOS_POR_MODULO[modulo]).includes(p)
    );
  });
  
  return { tabs, adminPerms, permisosPorModulo };
};

function Administrador({ serverUrl, pushToast, socket }) {
  const { token, user, perms } = useAuth();
  const { showConfirm } = useAlert();

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permsAll, setPermsAll] = useState([]);
  const [tabsAbiertos, setTabsAbiertos] = useState({});
  const [visibilidadPestañas, setVisibilidadPestañas] = useState({}); // { "tab:escaneo": { visible_tablet: 1, visible_celular: 1 } }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalUser, setModalUser] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editActive, setEditActive] = useState(1);
  const [editRoles, setEditRoles] = useState([]);
  const [editPerms, setEditPerms] = useState([]);
  const [savingUser, setSavingUser] = useState(false);

  // Gestión de roles
  const [modalRole, setModalRole] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRolePerms, setEditRolePerms] = useState([]);
  const [modalTab, setModalTab] = useState("usuario"); // Pestaña activa del modal
  const [tempPasswordInput, setTempPasswordInput] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  // 🆕 Estado para modal de contraseña al crear nuevo usuario
  const [modalPasswordNuevoUsuario, setModalPasswordNuevoUsuario] = useState(false);
  const [nuevoUsuarioCreado, setNuevoUsuarioCreado] = useState(null); // { id, name }
  const [passwordNuevoUsuario, setPasswordNuevoUsuario] = useState("");
  const [guarandoPasswordNuevoUsuario, setGuardandoPasswordNuevoUsuario] = useState(false);
  // 🔵 NUEVOS ESTADOS (Sesiones + Foto perfil)
  const [modalSesiones, setModalSesiones] = useState(false);
  const [sesionesUsuario, setSesionesUsuario] = useState([]);
  const [loadingSesiones, setLoadingSesiones] = useState(false);

  const [fotoPerfil, setFotoPerfil] = useState(null);
  const [previewFoto, setPreviewFoto] = useState(null);

  // 🔵 ESTADOS PARA AUDITORÍA
  const [auditoria, setAuditoria] = useState([]);
  const [usuariosActivos, setUsuariosActivos] = useState([]);
  const [loadingAuditoria, setLoadingAuditoria] = useState(false);
  const auditoriaCompletaRef = useRef([]);
  const cargandoAuditoriaRef = useRef(false);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("");
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const [filtroFecha, setFiltroFecha] = useState(() => {
    // Por defecto, fecha de hoy en formato YYYY-MM-DD
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${año}-${mes}-${dia}`;
  });
  const [totalAuditoria, setTotalAuditoria] = useState(0);
  
  // 🔵 PESTAÑA ACTIVA DEL ADMIN
  const [tabActivaAdmin, setTabActivaAdmin] = useState("usuarios");
  
  // Estados para eventos de seguridad
  const [eventosSeguridad, setEventosSeguridad] = useState([]);
  const [loadingEventosSeguridad, setLoadingEventosSeguridad] = useState(false);
  const [totalEventosSeguridad, setTotalEventosSeguridad] = useState(0);
  const [filtroEventoTipo, setFiltroEventoTipo] = useState("");
  const [filtroEventoIP, setFiltroEventoIP] = useState("");
  const [filtroBusquedaEventos, setFiltroBusquedaEventos] = useState("");
  
  // Estados para gestión de bloqueos
  const [bloqueosBruteForce, setBloqueosBruteForce] = useState([]);
  const [loadingBloqueos, setLoadingBloqueos] = useState(false);
  const [ipsBloqueadas, setIpsBloqueadas] = useState([]);
  const [loadingIPs, setLoadingIPs] = useState(false);
  const [estadisticasSeguridad, setEstadisticasSeguridad] = useState(null);

  // 🔵 ESTADOS PARA CONFIRMACIÓN CON CÓDIGOS
  const [showConfirmationCodeModal, setShowConfirmationCodeModal] = useState(false);
  const [confirmationCodeAction, setConfirmationCodeAction] = useState(null); // { accion, detalles, callback }
  const [confirmingAction, setConfirmingAction] = useState(false);

  // 🔵 ESTADOS PARA GESTIÓN DE ROLES
  const [modalRol, setModalRol] = useState(false);
  const [rolEditando, setRolEditando] = useState(null); // null = nuevo, objeto = editar
  const [nombreRol, setNombreRol] = useState("");
  const [permsDelRol, setPermsDelRol] = useState([]); // Permisos seleccionados para el rol
  const [savingRol, setSavingRol] = useState(false);
  const [loadingPermsRol, setLoadingPermsRol] = useState(false);

  const notify = (msg, type = "ok") => {
    if (pushToast) pushToast(msg, type);
    else window.alert(msg);
  };

  const authFetch = async (url, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error || `Error HTTP ${res.status}`;
      
      // Si es error 401, no lanzar error visible, solo silenciosamente
      if (res.status === 401) {
        const error = new Error("Sesión cerrada");
        error.silent = true;
        throw error;
      }
      
      throw new Error(msg);
    }
    return res.json();
  };

  // ───────────────────────────
  // CARGAS INICIALES
  // ───────────────────────────
  useEffect(() => {
    let mounted = true;

    const loadAll = async () => {
      try {
        setLoading(true);
        setError("");

        const [u, r, p] = await Promise.all([
          authFetch(`${serverUrl}/admin/users`),
          authFetch(`${serverUrl}/admin/roles`),
          authFetch(`${serverUrl}/admin/perms`),
        ]);

        if (!mounted) return;
        
        // Debug: Log de IXORA
        const ixora = u?.find(usr => usr.nickname === 'IXORA');
        if (ixora) {
          console.log('📸 IXORA en frontend:', { id: ixora.id, name: ixora.name, photo: ixora.photo, es_sistema: ixora.es_sistema });
        } else {
          console.log('⚠️ IXORA no encontrado en la lista de usuarios');
        }
        
        setUsuarios(u || []);
        setRoles(r || []);
        
        // Procesar permisos: si vienen como objetos con visibilidad, extraer solo el perm
        const permisosLista = Array.isArray(p) ? p.map(perm => 
          typeof perm === 'object' && perm.perm ? perm.perm : perm
        ) : [];
        
        // Filtrar permisos obsoletos
        const permisosFiltrados = permisosLista.filter(perm => !PERMISOS_OBSOLETOS.includes(perm));
        setPermsAll(permisosFiltrados);
        
        // Guardar visibilidad de pestañas (solo tabs)
        const visibilidad = {};
        if (Array.isArray(p)) {
          p.forEach(perm => {
            if (typeof perm === 'object' && perm.perm && perm.perm.startsWith('tab:')) {
              visibilidad[perm.perm] = {
                visible_tablet: perm.visible_tablet !== undefined ? perm.visible_tablet : 1,
                visible_celular: perm.visible_celular !== undefined ? perm.visible_celular : 1
              };
            }
          });
        }
        setVisibilidadPestañas(visibilidad);
      } catch (err) {
        console.error("ADMIN LOAD:", err);
        if (mounted) {
          setError(err.message || "Error cargando datos");
          notify("❌ Error cargando administración", "err");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadAll();
    return () => {
      mounted = false;
    };
  }, [serverUrl, token]);

  // ───────────────────────────
  // SOCKET.IO - ACTUALIZACIONES EN TIEMPO REAL
  // ───────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleUsuariosActualizados = () => {
      // Recargar usuarios y roles cuando hay cambios
      const recargar = async () => {
        try {
          const [u, r] = await Promise.all([
            authFetch(`${serverUrl}/admin/users`),
            authFetch(`${serverUrl}/admin/roles`),
          ]);
          setUsuarios(u || []);
          setRoles(r || []);
        } catch (err) {
          console.error("Error recargando datos:", err);
        }
      };
      recargar();
    };

    const handleRolesActualizados = () => {
      // Recargar roles cuando hay cambios
      const recargar = async () => {
        try {
          const r = await authFetch(`${serverUrl}/admin/roles`);
          setRoles(r || []);
        } catch (err) {
          console.error("Error recargando roles:", err);
        }
      };
      recargar();
    };

    socket.on("usuarios_actualizados", handleUsuariosActualizados);
    socket.on("roles_actualizados", handleRolesActualizados);

    return () => {
      socket.off("usuarios_actualizados", handleUsuariosActualizados);
      socket.off("roles_actualizados", handleRolesActualizados);
    };
  }, [socket, serverUrl, token]);

  // ───────────────────────────
  // CARGAR AUDITORÍA (MANUAL) - Optimizada para evitar parpadeos
  // ───────────────────────────
  const cargarAuditoriaManualRef = useRef(false);
  
  const cargarAuditoriaManual = useCallback(async () => {
    if (cargarAuditoriaManualRef.current || cargandoAuditoriaRef.current) return; // Evitar llamadas simultáneas
    if (!token) return;
    try {
      cargarAuditoriaManualRef.current = true;
      cargandoAuditoriaRef.current = true;
      setLoadingAuditoria(true);
      const params = new URLSearchParams();
      if (filtroUsuario) params.append("usuario", filtroUsuario);
      if (filtroAccion) params.append("accion", filtroAccion);
      if (filtroFecha) params.append("fecha", filtroFecha);
      params.append("limite", "500");

      const data = await authFetch(
        `${serverUrl}/admin/auditoria?${params.toString()}`
      );
      
      const nuevosRegistros = data.registros || [];
      const nuevoTotal = data.total || 0;
      
      // Solo actualizar si hay cambios reales para evitar re-renders innecesarios
      const registrosAnteriores = auditoriaCompletaRef.current;
      const hayCambios = 
        registrosAnteriores.length === 0 || 
        nuevosRegistros.length === 0 ||
        registrosAnteriores.length !== nuevosRegistros.length ||
        registrosAnteriores[0]?.id !== nuevosRegistros[0]?.id || 
        registrosAnteriores[registrosAnteriores.length - 1]?.id !== nuevosRegistros[nuevosRegistros.length - 1]?.id;
      
      if (hayCambios) {
        auditoriaCompletaRef.current = nuevosRegistros;
        setAuditoriaCompleta(nuevosRegistros);
        setTotalAuditoria(nuevoTotal);
      }
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error cargando auditoría:", err);
      notify("❌ Error cargando auditoría", "err");
    } finally {
      setLoadingAuditoria(false);
      cargarAuditoriaManualRef.current = false;
      cargandoAuditoriaRef.current = false;
    }
  }, [filtroUsuario, filtroAccion, filtroFecha, serverUrl, token, authFetch]);

  // ───────────────────────────
  // CARGAR USUARIOS ACTIVOS
  // ───────────────────────────
  const cargarUsuariosActivos = async () => {
    try {
      const data = await authFetch(`${serverUrl}/admin/usuarios-activos`);
      setUsuariosActivos(data.activosSocket || []);
    } catch (err) {
      // Si es error de autenticación, no mostrar error
      if (!err.silent) {
        console.error("Error cargando usuarios activos:", err);
      }
    }
  };

  // Estado para almacenar todos los registros sin filtrar
  const [auditoriaCompleta, setAuditoriaCompleta] = useState([]);
  
  // Sincronizar ref con el estado
  useEffect(() => {
    auditoriaCompletaRef.current = auditoriaCompleta;
  }, [auditoriaCompleta]);

  // Actualizar fecha automáticamente cuando cambia el día
  useEffect(() => {
    const actualizarFecha = () => {
      const hoy = new Date();
      const año = hoy.getFullYear();
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      const dia = String(hoy.getDate()).padStart(2, '0');
      const fechaHoy = `${año}-${mes}-${dia}`;
      
      // Solo actualizar si la fecha actual es diferente a la seleccionada
      // y si no hay una fecha específica seleccionada manualmente
      setFiltroFecha(prev => {
        // Si la fecha previa es de hoy o está vacía, actualizar
        const prevHoy = new Date();
        const prevAño = prevHoy.getFullYear();
        const prevMes = String(prevHoy.getMonth() + 1).padStart(2, '0');
        const prevDia = String(prevHoy.getDate()).padStart(2, '0');
        const prevFechaHoy = `${prevAño}-${prevMes}-${prevDia}`;
        
        if (!prev || prev === prevFechaHoy) {
          return fechaHoy;
        }
        return prev;
      });
    };
    
    // Actualizar inmediatamente
    actualizarFecha();
    
    // Actualizar cada 5 minutos para detectar cambios de día (reducir re-renders)
    const interval = setInterval(actualizarFecha, 300000);
    
    return () => clearInterval(interval);
  }, []);

  // Cargar auditoría desde servidor (optimizado para evitar parpadeos)
  useEffect(() => {
    if (!token) return;
    if (tabActivaAdmin !== "auditoria") return;
    
    // Cargar solo una vez al abrir la pestaña
    if (!cargandoAuditoriaRef.current) {
      cargarAuditoriaManual();
      cargarUsuariosActivos();
    }

    // Aumentar intervalo a 90 segundos para reducir parpadeos (era 30 segundos)
    const interval = setInterval(() => {
      if (tabActivaAdmin === "auditoria" && !cargandoAuditoriaRef.current) {
        cargarAuditoriaManual();
        cargarUsuariosActivos();
      }
    }, 90000); // Actualizar cada 90 segundos para mejor rendimiento

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActivaAdmin, token]); // Removido cargarAuditoriaManual de dependencias

  // Cargar eventos de seguridad
  const cargarEventosSeguridad = async () => {
    if (!token) return;
    try {
      setLoadingEventosSeguridad(true);
      const params = new URLSearchParams();
      if (filtroEventoTipo) params.append("tipo", filtroEventoTipo);
      if (filtroEventoIP) params.append("ip", filtroEventoIP);
      params.append("limite", "500");

      const data = await authFetch(
        `${serverUrl}/admin/eventos-seguridad?${params.toString()}`
      );
      
      setEventosSeguridad(data.eventos || []);
      setTotalEventosSeguridad(data.total || 0);
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error cargando eventos de seguridad:", err);
      notify("❌ Error cargando eventos de seguridad", "err");
    } finally {
      setLoadingEventosSeguridad(false);
    }
  };

  // Cargar bloqueos de brute force
  const cargarBloqueosBruteForce = async () => {
    if (!token) return;
    try {
      setLoadingBloqueos(true);
      const data = await authFetch(`${serverUrl}/api/seguridad/brute-force-attempts`);
      setBloqueosBruteForce(data || []);
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error cargando bloqueos:", err);
      notify("❌ Error cargando bloqueos", "err");
    } finally {
      setLoadingBloqueos(false);
    }
  };

  // Cargar IPs bloqueadas
  const cargarIPsBloqueadas = async () => {
    if (!token) return;
    try {
      setLoadingIPs(true);
      const data = await authFetch(`${serverUrl}/api/seguridad/blocked-ips`);
      setIpsBloqueadas(data || []);
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error cargando IPs bloqueadas:", err);
      notify("❌ Error cargando IPs bloqueadas", "err");
    } finally {
      setLoadingIPs(false);
    }
  };

  // Cargar estadísticas de seguridad
  const cargarEstadisticasSeguridad = async () => {
    if (!token) return;
    try {
      const data = await authFetch(`${serverUrl}/api/seguridad/stats`);
      setEstadisticasSeguridad(data);
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error cargando estadísticas:", err);
    }
  };

  // Desbloquear identificador (cuenta o IP)
  const desbloquearIdentificador = async (identifier) => {
    const displayName = identifier.includes("account:") 
      ? (identifier.replace("account:", "") || identifier)
      : identifier;
    
    const confirmado = await showConfirm(`¿Desbloquear ${displayName}?`, "Confirmar desbloqueo");
    if (!confirmado) return;
    
    try {
      const encoded = encodeURIComponent(identifier);
      await authFetch(`${serverUrl}/api/seguridad/brute-force-attempts/${encoded}`, {
        method: "DELETE",
      });
      
      // Esperar un momento para que se procese
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Recargar los bloqueos
      await cargarBloqueosBruteForce();
      await cargarIPsBloqueadas();
      
      notify(`✅ ${displayName} desbloqueado exitosamente`, "ok");
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error desbloqueando:", err);
      notify(`❌ Error al desbloquear: ${err.message || "Error desconocido"}`, "err");
    }
  };

  // Desbloquear IP específica
  const desbloquearIP = async (ip) => {
    if (!window.confirm(`¿Desbloquear IP ${ip}?`)) return;
    
    try {
      await authFetch(`${serverUrl}/api/seguridad/blocked-ips/${encodeURIComponent(ip)}`, {
        method: "DELETE",
      });
      notify(`✅ IP ${ip} desbloqueada`, "ok");
      cargarIPsBloqueadas();
      cargarBloqueosBruteForce();
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error desbloqueando IP:", err);
      notify("❌ Error al desbloquear IP", "err");
    }
  };

  // Desbloquear todo
  const desbloquearTodo = async () => {
    const confirmado = await showConfirm("¿Desbloquear TODAS las cuentas e IPs bloqueadas? Esta acción no se puede deshacer.", "Confirmar desbloqueo");
    if (!confirmado) return;
    
    try {
      await authFetch(`${serverUrl}/api/seguridad/brute-force-attempts/clear-all`, {
        method: "POST",
      });
      notify("✅ Todos los bloqueos han sido eliminados", "ok");
      cargarBloqueosBruteForce();
      cargarIPsBloqueadas();
    } catch (err) {
      if (err.silent) {
        return;
      }
      console.error("Error desbloqueando todo:", err);
      notify("❌ Error al desbloquear todo", "err");
    }
  };

  useEffect(() => {
    if (!token) return;
    if (tabActivaAdmin !== "seguridad") return;
    
    cargarEventosSeguridad();

    // Aumentar intervalo a 60 segundos para reducir parpadeos
    const interval = setInterval(() => {
      if (tabActivaAdmin === "seguridad") {
        cargarEventosSeguridad();
        cargarBloqueosBruteForce();
        cargarIPsBloqueadas();
        cargarEstadisticasSeguridad();
      }
    }, 60000); // Actualizar cada 60 segundos (era 30)

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEventoTipo, filtroEventoIP, tabActivaAdmin, serverUrl, token]);

  // Aplicar filtro de búsqueda localmente
  // Optimizar filtro de búsqueda con useMemo para evitar re-renders innecesarios
  const auditoriaFiltrada = useMemo(() => {
    const registros = auditoriaCompleta;
    if (!filtroBusqueda) {
      return registros;
    }

    const busquedaLower = filtroBusqueda.toLowerCase();
    return registros.filter((r) =>
      (r.usuario && r.usuario.toLowerCase().includes(busquedaLower)) ||
      (r.accion && r.accion.toLowerCase().includes(busquedaLower)) ||
      (r.detalle && r.detalle.toLowerCase().includes(busquedaLower)) ||
      (r.tabla_afectada && r.tabla_afectada.toLowerCase().includes(busquedaLower))
    );
  }, [filtroBusqueda, auditoriaCompleta]);

  // Sincronizar auditoriaFiltrada con el estado solo cuando realmente cambia
  useEffect(() => {
    // Comparar si realmente hay cambios antes de actualizar
    const auditoriaActual = auditoria;
    const hayCambios = 
      auditoriaActual.length !== auditoriaFiltrada.length ||
      auditoriaActual.length === 0 ||
      auditoriaFiltrada.length === 0 ||
      (auditoriaActual.length > 0 && auditoriaFiltrada.length > 0 && 
       auditoriaActual[0]?.id !== auditoriaFiltrada[0]?.id);
    
    if (hayCambios) {
      setAuditoria(auditoriaFiltrada);
    }
  }, [auditoriaFiltrada, auditoria]);

  // ───────────────────────────
  // ABRIR MODAL USUARIO
  // ───────────────────────────
  const abrirEditarUsuario = async (u) => {
    try {
      setEditUser(u);
      setEditName(u.name || "");
      setEditPhone(u.phone || "");
      setEditNickname(u.nickname || "");
      setEditUsername(u.username || "");
      setEditActive(typeof u.active === "number" ? u.active : 1);
      // setNipEdicion(""); - Removed NIP system
      
      // Limpiar foto de perfil al abrir modal de edición (se mostrará la foto existente si hay)
      setFotoPerfil(null);
      setPreviewFoto(null);

      const [userRoles, userPerms] = await Promise.all([
        authFetch(`${serverUrl}/admin/users/${u.id}/roles`),
        authFetch(`${serverUrl}/admin/users/${u.id}/perms`),
      ]);

      setEditRoles(userRoles || []);
      
      // Guardar permisos directos originales para referencia
      const permisosDirectosOriginales = new Set(userPerms || []);
      
      // Cargar permisos de los roles del usuario
      const permisosDeRoles = new Set();
      if (userRoles && userRoles.length > 0) {
        // Cargar permisos de cada rol
        for (const rolNombre of userRoles) {
          const rol = roles.find((r) => r.name === rolNombre);
          if (rol) {
            try {
              const permisosRol = await authFetch(`${serverUrl}/admin/roles/${rol.id}/perms`);
              permisosRol.forEach((perm) => permisosDeRoles.add(perm));
            } catch (err) {
              console.error(`Error cargando permisos del rol ${rolNombre}:`, err);
            }
          }
        }
      }
      
      // Combinar permisos directos con permisos de roles para mostrar en el modal
      // Pero guardar referencia de cuáles son directos originales
      const todosLosPermisos = new Set([...userPerms, ...permisosDeRoles]);
      setEditPerms(Array.from(todosLosPermisos));
      
      // Guardar referencia de permisos directos originales en el componente
      window._permisosDirectosOriginales = permisosDirectosOriginales;
      setModalTab("usuario"); // Resetear a pestaña de usuario
      setModalUser(true);
    } catch (err) {
      console.error("abrirEditarUsuario:", err);
      notify("❌ Error cargando info del usuario", "err");
    }
  };

  // ───────────────────────────
  // ABRIR MODAL SESIONES
  // ───────────────────────────
  const abrirModalSesiones = async (u) => {
    setEditUser(u);
    setLoadingSesiones(true);
    try {
      const sesiones = await authFetch(`${serverUrl}/admin/users/${u.id}/sessions`);
      setSesionesUsuario(sesiones || []);
      setModalSesiones(true);
    } catch (err) {
      notify("❌ Error cargando sesiones", "err");
    } finally {
      setLoadingSesiones(false);
    }
  };

  const cerrarSesion = async (idSesion) => {
    try {
      await authFetch(`${serverUrl}/admin/sessions/${idSesion}`, { method: "DELETE" });
      notify("🔒 Sesión cerrada");
      abrirModalSesiones(editUser); // refrescar
    } catch (err) {
      notify("❌ Error cerrando sesión", "err");
    }
  };

  const cerrarTodas = async () => {
    try {
      await authFetch(`${serverUrl}/admin/users/${editUser.id}/sessions`, {
        method: "DELETE",
      });
      notify("🔒 Todas las sesiones cerradas");
      setSesionesUsuario([]);
    } catch (err) {
      notify("❌ Error cerrando sesiones", "err");
    }
  };

  // ───────────────────────────
  // GUARDAR USUARIO
  // ───────────────────────────
  const guardarUsuario = async () => {
    // Validar campos requeridos
    if (!editName || !editPhone) {
      notify("❌ Nombre y teléfono son requeridos", "err");
      return;
    }

    try {
      setSavingUser(true);

      let userId;

      if (editUser) {
        // EDITAR USUARIO EXISTENTE
        // Si editNickname es cadena vacía, enviar null explícitamente para borrarlo
        await authFetch(`${serverUrl}/admin/users/${editUser.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: editName,
            phone: editPhone,
            active: editActive ? 1 : 0,
            nickname: editNickname.trim() === "" ? null : (editNickname.trim() || null),
            username: editUsername.trim() === "" ? null : (editUsername.trim() || null),
          }),
        });

        userId = editUser.id;
      } else {
        // CREAR NUEVO USUARIO
        const nuevoUsuario = await authFetch(`${serverUrl}/admin/users`, {
          method: "POST",
          body: JSON.stringify({
            name: editName,
            phone: editPhone,
            active: editActive ? 1 : 0,
            nickname: editNickname.trim() === "" ? null : (editNickname.trim() || null),
            username: editUsername.trim() === "" ? null : (editUsername.trim() || null),
          }),
        });

        userId = nuevoUsuario.id;
      }

      // Actualizar roles y permisos
      await authFetch(`${serverUrl}/admin/users/${userId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roles: editRoles }),
      });

      // Obtener permisos directos originales (guardados cuando se abrió el modal)
      const permisosDirectosOriginales = window._permisosDirectosOriginales || new Set();
      
      // Obtener permisos de roles del usuario
      const permisosDeRoles = new Set();
      if (editRoles && editRoles.length > 0) {
        for (const rolNombre of editRoles) {
          const rol = roles.find((r) => r.name === rolNombre);
          if (rol) {
            try {
              const permisosRol = await authFetch(`${serverUrl}/admin/roles/${rol.id}/perms`);
              permisosRol.forEach((perm) => permisosDeRoles.add(perm));
            } catch (err) {
              console.error(`Error cargando permisos del rol ${rolNombre}:`, err);
            }
          }
        }
      }
      
      // Determinar qué permisos son directos:
      // - Permisos en editPerms que NO vienen de los roles actuales = directos
      // - El permiso de confirmación SIEMPRE es directo (no existe en roles)
      const permisosDirectos = editPerms.filter(perm => {
        // El permiso de confirmación siempre se guarda como directo
        if (perm === "admin.confirmacion.recibir_codigos") {
          return true;
        }
        // Si no está en roles, es directo
        if (!permisosDeRoles.has(perm)) {
          return true;
        }
        // Si está en roles pero también estaba en permisos directos originales, mantenerlo como directo
        if (permisosDirectosOriginales.has(perm)) {
          return true;
        }
        // Si está en roles pero no estaba en directos originales, no guardarlo como directo
        return false;
      });
      
      console.log("🔍 [Admin] Guardando permisos:", {
        total: editPerms.length,
        deRoles: permisosDeRoles.size,
        directosOriginales: permisosDirectosOriginales.size,
        directos: permisosDirectos.length,
        permisosDirectos,
        editPerms
      });

      await authFetch(`${serverUrl}/admin/users/${userId}/perms`, {
        method: "PUT",
        body: JSON.stringify({ perms: permisosDirectos }),
      });
      
      // Limpiar referencia
      delete window._permisosDirectosOriginales;
      
      // Emitir evento para que otros componentes refresquen permisos
      // Si el usuario editado es el mismo que está logueado, refrescar permisos
      if (user && user.id === userId) {
        window.dispatchEvent(new CustomEvent('permisos-actualizados'));
      }

      // 🔵 Si hay foto, subirla
      if (fotoPerfil) {
        const form = new FormData();
        form.append("photo", fotoPerfil);

        await fetch(`${serverUrl}/admin/users/${userId}/photo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      }

      const isNuevo = !editUser;
      notify(isNuevo ? "✅ Usuario creado" : "✅ Usuario actualizado");
      
      // Actualizar estado local SIN recargar (evita salto de scroll)
      if (isNuevo) {
        // ✨ Si es nuevo usuario, mostrar modal para ingresar contraseña
        // NO agregar al estado local aún para evitar duplicados
        setNuevoUsuarioCreado({ id: userId, name: editName });
        setModalPasswordNuevoUsuario(true);
        setModalUser(false); // Cerrar el modal de creación
      } else {
        // Actualizar usuario existente
        setUsuarios(prev => prev.map(u => 
          u.id === userId 
            ? {
                ...u,
                name: editName,
                phone: editPhone,
                active: editActive ? 1 : 0,
                nickname: editNickname.trim() || null,
                username: editUsername.trim() || null,
                roles: editRoles,
                permisos: editPerms,
              }
            : u
        ));
        
        setModalUser(false);
      }
      // Resetear los campos del formulario
      setEditUser(null);
      setEditName("");
      setEditPhone("");
      setEditNickname("");
      setEditUsername("");
      setEditActive(1);
      setEditRoles([]);
      setEditPerms([]);
      setFotoPerfil(null);
      setPreviewFoto(null);
    } catch (err) {
      console.error("guardarUsuario:", err);
      notify("❌ " + (err.message || "Error guardando usuario"), "err");
    } finally {
      setSavingUser(false);
      setFotoPerfil(null);
      setPreviewFoto(null);
    }
  };

  // ───────────────────────────
  // 🆕 GUARDAR CONTRASEÑA NUEVO USUARIO
  // ───────────────────────────
  const guardarPasswordNuevoUsuario = async () => {
    if (!passwordNuevoUsuario || passwordNuevoUsuario.length < 6) {
      showConfirm("La contraseña debe tener al menos 6 caracteres", "Error");
      return;
    }

    setGuardandoPasswordNuevoUsuario(true);
    try {
      await authFetch(`${serverUrl}/admin/users/${nuevoUsuarioCreado.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({
          temporaryPassword: passwordNuevoUsuario,
        }),
      });

      // Actualizar el usuario para marcarlo como activo
      await authFetch(`${serverUrl}/admin/users/${nuevoUsuarioCreado.id}`, {
        method: "PUT",
        body: JSON.stringify({
          active: 1,
        }),
      });

      // Recargar la lista de usuarios desde el servidor
      let usuariosActualizados = [];
      try {
        usuariosActualizados = await authFetch(`${serverUrl}/admin/users`);
        setUsuarios(usuariosActualizados || []);
      } catch (reloadErr) {
        console.error("Error recargando usuarios:", reloadErr);
      }

      notify(`✅ Contraseña establecida y usuario ${nuevoUsuarioCreado.name} activado`);
      
      // Cerrar modal de password
      setModalPasswordNuevoUsuario(false);
      
      // NIP system removed - close completely
      setNuevoUsuarioCreado(null);
      setPasswordNuevoUsuario("");
    } catch (err) {
      console.error("Error guardando contraseña:", err);
      showConfirm("❌ " + (err.message || "Error guardando contraseña"), "Error");
    } finally {
      setGuardandoPasswordNuevoUsuario(false);
    }
  };

  // ───────────────────────────
  // RESTABLECER CONTRASEÑA
  // ───────────────────────────
  const restablecerContraseña = async () => {
    if (!editUser) return;
    
    if (!tempPasswordInput || tempPasswordInput.length < 6) {
      notify("❌ La contraseña temporal debe tener al menos 6 caracteres", "err");
      return;
    }

    const confirmado = await showConfirm(`¿Restablecer contraseña para ${editUser.name}?\n\nSe cerrarán todas sus sesiones y deberá cambiar la contraseña en el próximo login.`, "Confirmar restablecimiento");
    if (!confirmado) {
      return;
    }

    // Solicitar confirmación con código (si el usuario actual tiene permiso)
    if (user && perms && perms.includes("admin.confirmacion.recibir_codigos")) {
      solicitudConfirmacionConCodigo(
        "reset_password",
        `Restablecer contraseña: ${editUser.name}`,
        async () => {
          try {
            setResettingPassword(true);
            await authFetch(`${serverUrl}/admin/users/${editUser.id}/reset-password`, {
              method: "POST",
              body: JSON.stringify({ temporaryPassword: tempPasswordInput }),
            });
            notify("✅ Contraseña restablecida correctamente");
            setTempPasswordInput("");
          } catch (err) {
            console.error(err);
            notify("❌ " + (err.message || "Error restableciendo contraseña"), "err");
          } finally {
            setResettingPassword(false);
          }
        }
      );
    } else {
      // Sin confirmación de código
      try {
        setResettingPassword(true);
        await authFetch(`${serverUrl}/admin/users/${editUser.id}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ temporaryPassword: tempPasswordInput }),
        });
        notify("✅ Contraseña restablecida correctamente");
        setTempPasswordInput("");
      } catch (err) {
        console.error(err);
        notify("❌ " + (err.message || "Error restableciendo contraseña"), "err");
      } finally {
        setResettingPassword(false);
      }
    }
  };

  // ───────────────────────────
  // BORRAR USUARIO
  // ───────────────────────────
  const borrarUsuario = async (u) => {
    const confirmado = await showConfirm(`¿Eliminar usuario ${u.name}?`, "Confirmar eliminación");
    if (!confirmado) return;

    // Solicitar confirmación con código (si el usuario actual tiene permiso)
    if (user && perms && perms.includes("admin.confirmacion.recibir_codigos")) {
      solicitudConfirmacionConCodigo(
        "delete_user",
        `Eliminar usuario: ${u.name}`,
        async () => {
          try {
            await authFetch(`${serverUrl}/admin/users/${u.id}`, {
              method: "DELETE",
            });
            // Eliminar del estado local SIN recargar (evita salto de scroll)
            setUsuarios(prev => prev.filter(usr => usr.id !== u.id));
            notify("🗑️ Usuario eliminado");
          } catch (err) {
            console.error(err);
            notify("❌ " + (err.message || "Error eliminando usuario"), "err");
          }
        }
      );
    } else {
      // Sin confirmación de código, eliminar directamente
      try {
        await authFetch(`${serverUrl}/admin/users/${u.id}`, {
          method: "DELETE",
        });
        setUsuarios(prev => prev.filter(usr => usr.id !== u.id));
        notify("🗑️ Usuario eliminado");
      } catch (err) {
        console.error(err);
        notify("❌ " + (err.message || "Error eliminando usuario"), "err");
      }
    }
  };

  // ───────────────────────────
  // SOLICITAR CONFIRMACIÓN CON CÓDIGO
  // ───────────────────────────
  const solicitudConfirmacionConCodigo = (accion, detalles, callback) => {
    setConfirmationCodeAction({ accion, detalles, callback });
    setShowConfirmationCodeModal(true);
  };

  const handleConfirmationCodeConfirmed = async () => {
    if (!confirmationCodeAction || !confirmationCodeAction.callback) return;
    
    setConfirmingAction(true);
    try {
      await confirmationCodeAction.callback();
    } catch (err) {
      console.error("Error ejecutando acción confirmada:", err);
    } finally {
      setConfirmingAction(false);
      setShowConfirmationCodeModal(false);
      setConfirmationCodeAction(null);
    }
  };

  // ───────────────────────────
  // TOGGLES
  // ───────────────────────────
  const toggleRole = async (name) => {
    const estabaSeleccionado = editRoles.includes(name);
    const nuevosRoles = estabaSeleccionado
      ? editRoles.filter((r) => r !== name)
      : [...editRoles, name];
    
    setEditRoles(nuevosRoles);

    // Si se está seleccionando un rol, cargar y aplicar sus permisos
    if (!estabaSeleccionado) {
      try {
        const rol = roles.find((r) => r.name === name);
        if (rol) {
          const permisosRol = await authFetch(`${serverUrl}/admin/roles/${rol.id}/perms`);
          
          // Agregar los permisos del rol a los permisos actuales (sin duplicados)
          setEditPerms((prev) => {
            const nuevosPermisos = [...prev];
            permisosRol.forEach((perm) => {
              if (!nuevosPermisos.includes(perm)) {
                nuevosPermisos.push(perm);
              }
            });
            return nuevosPermisos;
          });
        }
      } catch (err) {
        console.error("Error cargando permisos del rol:", err);
        notify("⚠️ Error cargando permisos del rol", "err");
      }
    } else {
      // Si se está deseleccionando un rol, quitar sus permisos (solo si no están en otro rol seleccionado)
      try {
        const rol = roles.find((r) => r.name === name);
        if (!rol) return;
        
        const permisosRol = await authFetch(`${serverUrl}/admin/roles/${rol.id}/perms`);
        const otrosRoles = nuevosRoles.filter((r) => r !== name);
        
        // Optimización: Cargar todos los permisos de otros roles en paralelo
        const permisosEnOtrosRoles = new Set();
        if (otrosRoles.length > 0) {
          const promesasPermisos = otrosRoles.map(async (otroRolNombre) => {
            const otroRol = roles.find((r) => r.name === otroRolNombre);
            if (otroRol) {
              try {
                const permisosOtroRol = await authFetch(`${serverUrl}/admin/roles/${otroRol.id}/perms`);
                return permisosOtroRol;
              } catch (err) {
                console.error(`Error cargando permisos del rol ${otroRolNombre}:`, err);
                return [];
              }
            }
            return [];
          });
          
          const resultados = await Promise.all(promesasPermisos);
          resultados.forEach((permisos) => {
            permisos.forEach((perm) => permisosEnOtrosRoles.add(perm));
          });
        }
        
        // Quitar solo los permisos que no están en otros roles seleccionados
        setEditPerms((prev) => {
          return prev.filter((perm) => {
            // Si el permiso está en el rol que se deseleccionó
            if (permisosRol.includes(perm)) {
              // Solo quitarlo si NO está en otros roles seleccionados
              return permisosEnOtrosRoles.has(perm);
            }
            // Mantener todos los demás permisos
            return true;
          });
        });
      } catch (err) {
        console.error("Error removiendo permisos del rol:", err);
        notify("⚠️ Error removiendo permisos del rol", "err");
      }
    }
  };

  const togglePerm = (perm) => {
    setEditPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const toggleTab = (tab) => {
    setTabsAbiertos((prev) => ({
      ...prev,
      [tab]: !prev[tab],
    }));
  };

  // Mapeo de tab a módulo (sin el prefijo "tab:")
  const tabAModulo = (tab) => {
    const tabSinPrefijo = tab.replace("tab:", "");
    // Mapeo especial para tabs que tienen nombres diferentes a los módulos
    const mapeo = {
      "escaneo": "picking",
      "registros": "registros",
      "devoluciones": "devoluciones",
      "reenvios": "reenvios",
      "reportes": "reportes",
      "rep_devol": "rep_devol",
      "rep_reenvios": "rep_reenvios",
      "activaciones": "activaciones",
      "rep_activaciones": "rep_activaciones",
      "inventario": "inventario",
      "tienda": "tienda",
      "activos": "activos",
      "admin": "admin",
      "ixora_ia": "ixora_ia",
      "auditoria": "auditoria",
    };
    return mapeo[tabSinPrefijo] || tabSinPrefijo;
  };

  const toggleAllTabs = () => {
    const todasActivas = tabsOrdenados.every((tab) => editPerms.includes(tab));
    
    if (todasActivas) {
      // Desactivar todas las pestañas
      setEditPerms((prev) => prev.filter((p) => !tabsOrdenados.includes(p)));
    } else {
      // Activar todas las pestañas
      setEditPerms((prev) => {
        const nuevas = [...prev];
        tabsOrdenados.forEach((tab) => {
          if (!nuevas.includes(tab)) nuevas.push(tab);
        });
        return nuevas;
      });
    }
  };

  // Toggle todos los permisos de un módulo específico
  const toggleAllPermisosModulo = (modulo) => {
    const permisosModulo = PERMISOS_POR_MODULO[modulo];
    if (!permisosModulo || Object.keys(permisosModulo).length === 0) return;

    const permisosKeys = Object.keys(permisosModulo);
    const todosActivos = permisosKeys.every((perm) => editPerms.includes(perm));

    if (todosActivos) {
      // Desactivar todos los permisos del módulo
      setEditPerms((prev) => prev.filter((p) => !permisosKeys.includes(p)));
    } else {
      // Activar todos los permisos del módulo
      setEditPerms((prev) => {
        const nuevas = [...prev];
        permisosKeys.forEach((perm) => {
          if (!nuevas.includes(perm)) nuevas.push(perm);
        });
        return nuevas;
      });
    }
  };

  // ───────────────────────────
  // GESTIÓN DE ROLES
  // ───────────────────────────

  // Cerrar modal de rol
  const cerrarModalRol = () => {
    setModalRole(false);
    setEditRole(null);
    setEditRoleName("");
    setEditRolePerms([]);
  };


  // Toggle permiso en rol
  const togglePermisoRol = (perm) => {
    setEditRolePerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  // Toggle todos los permisos del módulo en rol
  const toggleAllPermisosModuloRol = (modulo) => {
    const permisosModulo = PERMISOS_POR_MODULO[modulo];
    if (!permisosModulo || Object.keys(permisosModulo).length === 0) return;

    const permisosKeys = Object.keys(permisosModulo);
    const todosActivos = permisosKeys.every((perm) => editRolePerms.includes(perm));

    if (todosActivos) {
      // Desactivar todos los permisos del módulo
      setEditRolePerms((prev) => prev.filter((p) => !permisosKeys.includes(p)));
    } else {
      // Activar todos los permisos del módulo
      setEditRolePerms((prev) => {
        const nuevas = [...prev];
        permisosKeys.forEach((perm) => {
          if (!nuevas.includes(perm)) nuevas.push(perm);
        });
        return nuevas;
      });
    }
  };


  // Actualizar visibilidad de pestaña en dispositivos
  const actualizarVisibilidadPestaña = async (tab, dispositivo, valor) => {
    try {
      await authFetch(`${serverUrl}/admin/perms/${encodeURIComponent(tab)}/visibilidad`, {
        method: "PUT",
        body: JSON.stringify({
          [dispositivo]: valor ? 1 : 0
        }),
      });
      
      // Recargar permisos para obtener la visibilidad actualizada
      const p = await authFetch(`${serverUrl}/admin/perms`);
      
      // Procesar permisos: si vienen como objetos con visibilidad, extraer solo el perm
      const permisosLista = Array.isArray(p) ? p.map(perm => 
        typeof perm === 'object' && perm.perm ? perm.perm : perm
      ) : [];
      setPermsAll(permisosLista);
      
      // Guardar visibilidad de pestañas (solo tabs)
      const visibilidad = {};
      if (Array.isArray(p)) {
        p.forEach(perm => {
          if (typeof perm === 'object' && perm.perm && perm.perm.startsWith('tab:')) {
            visibilidad[perm.perm] = {
              visible_tablet: perm.visible_tablet !== undefined ? perm.visible_tablet : 1,
              visible_celular: perm.visible_celular !== undefined ? perm.visible_celular : 1
            };
          }
        });
      }
      setVisibilidadPestañas(visibilidad);
      
      notify(`✅ Visibilidad actualizada`, "ok");
    } catch (err) {
      console.error("Error actualizando visibilidad:", err);
      notify("❌ Error al actualizar visibilidad", "err");
    }
  };

  // ───────────────────────────
  // GESTIÓN DE ROLES
  // ───────────────────────────

  // Recargar lista de roles
  const recargarRoles = async () => {
    try {
      const r = await authFetch(`${serverUrl}/admin/roles`);
      setRoles(r || []);
    } catch (err) {
      console.error("Error recargando roles:", err);
      notify("❌ Error recargando roles", "err");
    }
  };

  // Abrir modal para crear un nuevo rol
  const abrirModalNuevoRol = () => {
    setRolEditando(null);
    setNombreRol("");
    setPermsDelRol([]);
    setModalRol(true);
  };

  // Abrir modal para editar un rol existente
  const abrirModalEditarRol = async (rol) => {
    setRolEditando(rol);
    setNombreRol(rol.name);
    setLoadingPermsRol(true);
    setModalRol(true);
    
    try {
      // Cargar permisos actuales del rol
      const permsRol = await authFetch(`${serverUrl}/admin/roles/${rol.id}/perms`);
      setPermsDelRol(permsRol || []);
    } catch (err) {
      console.error("Error cargando permisos del rol:", err);
      notify("❌ Error cargando permisos del rol", "err");
      setPermsDelRol([]);
    } finally {
      setLoadingPermsRol(false);
    }
  };

  // Guardar rol (crear o editar)
  const guardarRol = async () => {
    if (!nombreRol.trim()) {
      notify("❌ El nombre del rol es requerido", "err");
      return;
    }
    
    // Validar que no se intente crear otro rol llamado CEO
    if (!rolEditando && nombreRol.trim().toUpperCase() === "CEO") {
      notify("❌ No se puede crear otro rol con el nombre CEO", "err");
      return;
    }
    
    setSavingRol(true);
    try {
      if (rolEditando) {
        // Si es el rol CEO, solo actualizar permisos, no el nombre
        const datosActualizar = rolEditando.name === "CEO" 
          ? { name: "CEO", perms: permsDelRol }
          : { name: nombreRol.trim(), perms: permsDelRol };
        
        await authFetch(`${serverUrl}/admin/roles/${rolEditando.id}`, {
          method: "PUT",
          body: JSON.stringify(datosActualizar),
        });
        
        // Actualizar estado local SIN recargar (evita salto de scroll)
        setRoles(prev => prev.map(r => 
          r.id === rolEditando.id 
            ? { ...r, name: datosActualizar.name, perms: permsDelRol }
            : r
        ));
        notify("✅ Rol actualizado correctamente");
      } else {
        // Crear nuevo rol
        const nuevoRol = await authFetch(`${serverUrl}/admin/roles`, {
          method: "POST",
          body: JSON.stringify({ name: nombreRol.trim(), perms: permsDelRol }),
        });
        
        // Agregar al estado local SIN recargar
        if (nuevoRol && nuevoRol.id) {
          setRoles(prev => [...prev, nuevoRol]);
        } else {
          // Fallback: recargar si no devuelve el objeto
          await recargarRoles();
        }
        notify("✅ Rol creado correctamente");
      }
      
      setModalRol(false);
    } catch (err) {
      console.error("Error guardando rol:", err);
      notify("❌ " + (err.message || "Error guardando rol"), "err");
    } finally {
      setSavingRol(false);
    }
  };

  // Eliminar rol
  const eliminarRol = async (rol) => {
    // Proteger rol CEO - no se puede eliminar
    if (rol.name === "CEO") {
      notify("❌ El rol CEO es el rol principal del sistema y no puede ser eliminado", "err");
      return;
    }
    
    const confirmado = await showConfirm(
      `¿Eliminar el rol "${rol.name}"?`,
      "Esta acción no se puede deshacer. Los usuarios con este rol perderán los permisos asociados."
    );
    
    if (!confirmado) return;
    
    try {
      await authFetch(`${serverUrl}/admin/roles/${rol.id}`, {
        method: "DELETE",
      });
      // Eliminar del estado local SIN recargar (evita salto de scroll)
      setRoles(prev => prev.filter(r => r.id !== rol.id));
      notify("✅ Rol eliminado correctamente");
    } catch (err) {
      console.error("Error eliminando rol:", err);
      notify("❌ " + (err.message || "Error eliminando rol"), "err");
    }
  };

  // Toggle permiso en el rol
  const togglePermRol = (perm) => {
    setPermsDelRol((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  // Toggle todas las pestañas para el rol
  const toggleAllTabsRol = () => {
    const tabsOrdenados = TAB_ORDER.filter(tab => permsAll.includes(tab));
    const todasActivas = tabsOrdenados.every((tab) => permsDelRol.includes(tab));
    
    if (todasActivas) {
      setPermsDelRol((prev) => prev.filter((p) => !p.startsWith("tab:")));
    } else {
      setPermsDelRol((prev) => {
        const sinTabs = prev.filter((p) => !p.startsWith("tab:"));
        return [...sinTabs, ...tabsOrdenados];
      });
    }
  };

  // Toggle todos los permisos de un módulo para el rol
  const toggleAllModuloRol = (modulo) => {
    const permisosModulo = Object.keys(PERMISOS_POR_MODULO[modulo] || {});
    const todosActivos = permisosModulo.every((p) => permsDelRol.includes(p));
    
    if (todosActivos) {
      setPermsDelRol((prev) => prev.filter((p) => !permisosModulo.includes(p)));
    } else {
      setPermsDelRol((prev) => {
        const sinModulo = prev.filter((p) => !permisosModulo.includes(p));
        return [...sinModulo, ...permisosModulo];
      });
    }
  };

  // Cargar tarjetas del dashboard

  // Detectar tabs y permisos organizados por módulo
  const { tabs, adminPerms } = useMemo(() => {
    const detected = detectarTabsYPermisos(permsAll || []);
    // Ordenar tabs según TAB_ORDER
    const tabsOrdenados = TAB_ORDER.filter(tab => detected.tabs.includes(tab));
    const tabsRestantes = detected.tabs.filter(tab => !TAB_ORDER.includes(tab));
    return {
      tabs: [...tabsOrdenados, ...tabsRestantes],
      adminPerms: detected.adminPerms || []
    };
  }, [permsAll]);

  const tabsOrdenados = useMemo(() => {
    const ordenados = TAB_ORDER.filter(tab => tabs.includes(tab));
    const restantes = tabs.filter(tab => !TAB_ORDER.includes(tab));
    return [...ordenados, ...restantes];
  }, [tabs]);

  // Verificar si todas las pestañas están activas
  const todasPestañasActivas = tabsOrdenados.length > 0 && 
    tabsOrdenados.every(tab => editPerms.includes(tab));

  // ───────────────────────────
  // RENDER
  // ───────────────────────────
  if (loading) {
    return (
      <div className="admin-root">
        <div className="admin-loading">Cargando administración…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-root">
        <div className="admin-error">
          Error: {error}
          <br />
          Verifica que tu usuario tenga el permiso <code>tab:admin</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="admin-root">
      <div className="admin-header">
        <h2>Panel de administración</h2>
        <div className="admin-header-user">
          Sesión:{" "}
          <strong>{user?.nickname || user?.name || user?.phone || "?"}</strong>
        </div>
      </div>

      {/* PESTAÑAS DE ADMIN */}
      <div className="admin-tabs-container">
        <button
          onClick={() => setTabActivaAdmin("usuarios")}
          className={`admin-tab-button ${tabActivaAdmin === "usuarios" ? "active" : ""}`}
        >
          👥 Usuarios
        </button>
        <button
          onClick={() => setTabActivaAdmin("auditoria")}
          className={`admin-tab-button ${tabActivaAdmin === "auditoria" ? "active" : ""}`}
        >
          📊 Auditoría
        </button>
        <button
          onClick={() => setTabActivaAdmin("seguridad")}
          className={`admin-tab-button ${tabActivaAdmin === "seguridad" ? "active" : ""}`}
        >
          🔒 Seguridad
        </button>
        <button
          onClick={() => setTabActivaAdmin("personalizacion")}
          className={`admin-tab-button ${tabActivaAdmin === "personalizacion" ? "active" : ""}`}
        >
          🎨 Personalización
        </button>
        <button
          onClick={() => setTabActivaAdmin("roles")}
          className={`admin-tab-button ${tabActivaAdmin === "roles" ? "active" : ""}`}
        >
          🎭 Roles
        </button>
      </div>

      {/* CONTENIDO DE PESTAÑAS */}
      {tabActivaAdmin === "usuarios" && (
      <>
      {/* USUARIOS */}
      <section className="admin-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, padding: "12px 20px", background: "rgba(0, 255, 136, 0.1)", borderRadius: "14px", border: "1px solid rgba(0, 255, 136, 0.2)" }}>Usuarios</h3>
          <button
            className="btn-small btn-add-user"
            onClick={() => {
              setEditUser(null);
              setEditName("");
              setEditPhone("");
              setEditNickname("");
              setEditUsername("");
              setEditActive(1);
              setEditRoles([]);
              setEditPerms([]);
              setFotoPerfil(null);
              setPreviewFoto(null);
              setModalTab("usuario");
              setModalUser(true);
            }}
          >
            ➕ Agregar Usuario
          </button>
        </div>
        {usuarios.length === 0 ? (
          <p>No hay usuarios registrados.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Nombre</th>
                  <th>Nickname</th>
                  <th>Teléfono</th>
                  <th>Activo</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  // 🔥 Cache-busting para evitar fotos antiguas
                  const photoUrl = u.photo ? `${serverUrl}/uploads/perfiles/${u.photo}?t=${u.photoTimestamp || u.id}` : null;
                  
                  // Debug: Log para usuario IXORA
                  if (u.nickname === 'IXORA') {
                    console.log('📸 Renderizando IXORA:', { photo: u.photo, photoUrl, es_sistema: u.es_sistema });
                  }
                  
                  return (
                  <tr key={u.id}>
                    <td>
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={u.name}
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "2px solid #00ff88",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            background: "rgba(0, 255, 136, 0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "20px",
                          }}
                        >
                          👤
                        </div>
                      )}
                    </td>
                    <td>{u.name}</td>
                    <td>{u.nickname || "—"}</td>
                    <td>{u.phone}</td>
                    <td>{u.active ? "Sí" : "No"}</td>
                    <td>{u.created_at?.slice(0, 19) || ""}</td>
                    <td>
                      <button
                        className="btn-small"
                        onClick={() => abrirEditarUsuario(u)}
                      >
                        Editar
                      </button>

                      {/* NUEVO: Botón SESIONES */}
                      <button
                        className="btn-small btn-info"
                        onClick={() => abrirModalSesiones(u)}
                      >
                        Sesiones
                      </button>

                      {u.id !== user?.id && !u.es_sistema && (
                        <button
                          className="btn-small btn-danger"
                          onClick={() => borrarUsuario(u)}
                        >
                          Borrar
                        </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ESTADÍSTICAS DE SEGURIDAD */}
      {estadisticasSeguridad && (
        <section className="admin-section" style={{ marginTop: "30px" }}>
          <h3>📊 Estadísticas de Seguridad</h3>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
            gap: "15px",
            marginTop: "15px"
          }}>
            <div style={{
              background: "rgba(255,255,255,0.05)",
              padding: "15px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)"
            }}>
              <div style={{ color: "#888", fontSize: "0.85rem", marginBottom: "5px" }}>IPs Bloqueadas</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#ff4444" }}>
                {estadisticasSeguridad.totalBlocked || 0}
              </div>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.05)",
              padding: "15px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)"
            }}>
              <div style={{ color: "#888", fontSize: "0.85rem", marginBottom: "5px" }}>Cuentas Bloqueadas</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#ffaa00" }}>
                {bloqueosBruteForce.filter(b => b.identifier?.startsWith("account:")).length}
              </div>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.05)",
              padding: "15px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)"
            }}>
              <div style={{ color: "#888", fontSize: "0.85rem", marginBottom: "5px" }}>Total Bloqueos</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#00ff88" }}>
                {bloqueosBruteForce.length}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* GESTIÓN DE BLOQUEOS - BRUTE FORCE */}
      <section className="admin-section" style={{ marginTop: "30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <h3>🔐 Bloqueos por Intentos Fallidos (Brute Force)</h3>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="btn-small"
              onClick={cargarBloqueosBruteForce}
              disabled={loadingBloqueos}
            >
              {loadingBloqueos ? "Cargando..." : "🔄 Actualizar"}
            </button>
            {bloqueosBruteForce.length > 0 && (
              <button
                className="btn-small"
                onClick={desbloquearTodo}
                style={{ background: "#ff4444", color: "#fff" }}
              >
                🗑️ Desbloquear Todo
              </button>
            )}
          </div>
        </div>

        {loadingBloqueos ? (
          <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
            Cargando bloqueos...
          </p>
        ) : bloqueosBruteForce.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
            ✅ No hay bloqueos activos
          </p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuario/Identificador</th>
                  <th>Intentos</th>
                  <th>Estado</th>
                  <th>Bloqueado Hasta</th>
                  <th>Último Intento</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {bloqueosBruteForce.map((bloqueo, idx) => {
                  const isLocked = bloqueo.locked_until && bloqueo.minutes_left && bloqueo.minutes_left > 0;
                  const tipo = bloqueo.identifier?.startsWith("account:") ? "Cuenta" : "IP";
                  const valor = bloqueo.identifier?.replace("account:", "").replace("ip:", "") || bloqueo.identifier;
                  
                  // Mostrar información del usuario si está disponible
                  const mostrarUsuario = bloqueo.userName || bloqueo.displayName;
                  
                  return (
                    <tr key={idx}>
                      <td>
                        {mostrarUsuario ? (
                          <div>
                            <div style={{ fontWeight: "600", color: "#00ff88" }}>
                              👤 {bloqueo.userName || bloqueo.displayName}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "4px" }}>
                              {bloqueo.userPhone && `📱 ${bloqueo.userPhone}`}
                              {bloqueo.userPhone && bloqueo.userUsername && " • "}
                              {bloqueo.userUsername && `@${bloqueo.userUsername}`}
                              {!bloqueo.userPhone && !bloqueo.userUsername && `ID: ${valor}`}
                            </div>
                            {bloqueo.userActive === 0 && (
                              <div style={{ fontSize: "0.7rem", color: "#ff4444", marginTop: "2px" }}>
                                ⚠️ Usuario inactivo
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: "600" }}>{tipo}</div>
                            <div style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "#888" }}>
                              {valor}
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "center", fontWeight: "600" }}>
                        {bloqueo.attempts || 0}
                      </td>
                      <td>
                        {isLocked ? (
                          <span style={{ color: "#ff4444", fontWeight: "600" }}>
                            🔒 Bloqueado ({bloqueo.minutes_left} min)
                          </span>
                        ) : bloqueo.attempts >= 3 ? (
                          <span style={{ color: "#ffaa00", fontWeight: "600" }}>
                            ⚠️ {bloqueo.attempts} intentos (casi bloqueado)
                          </span>
                        ) : (
                          <span style={{ color: "#888" }}>⚠️ Intentos registrados</span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "#888" }}>
                        {bloqueo.locked_until 
                          ? new Date(bloqueo.locked_until).toLocaleString("es-ES")
                          : "—"
                        }
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "#888" }}>
                        {bloqueo.last_attempt_at 
                          ? new Date(bloqueo.last_attempt_at).toLocaleString("es-ES")
                          : "—"
                        }
                      </td>
                      <td>
                        <button
                          className="btn-small"
                          onClick={() => desbloquearIdentificador(bloqueo.identifier)}
                          style={{ background: "#00ff88", color: "#000", fontSize: "0.8rem" }}
                        >
                          ✅ Desbloquear
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* GESTIÓN DE IPs BLOQUEADAS */}
      <section className="admin-section" style={{ marginTop: "30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <h3>🚫 IPs Bloqueadas</h3>
          <button
            className="btn-small"
            onClick={cargarIPsBloqueadas}
            disabled={loadingIPs}
          >
            {loadingIPs ? "Cargando..." : "🔄 Actualizar"}
          </button>
        </div>

        {loadingIPs ? (
          <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
            Cargando IPs bloqueadas...
          </p>
        ) : ipsBloqueadas.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
            ✅ No hay IPs bloqueadas
          </p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Razón</th>
                  <th>Intentos</th>
                  <th>Bloqueada Desde</th>
                  <th>Bloqueada Hasta</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {ipsBloqueadas.map((ip, idx) => {
                  const blockedUntil = ip.blocked_until ? new Date(ip.blocked_until) : null;
                  const isExpired = blockedUntil && blockedUntil < new Date();
                  
                  return (
                    <tr key={idx}>
                      <td style={{ fontFamily: "monospace", fontWeight: "600" }}>
                        {ip.ip}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {ip.reason || "—"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {ip.attempts || 0}
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "#888" }}>
                        {ip.blocked_at 
                          ? new Date(ip.blocked_at).toLocaleString("es-ES")
                          : "—"
                        }
                      </td>
                      <td style={{ fontSize: "0.85rem", color: isExpired ? "#888" : "#ff4444" }}>
                        {blockedUntil 
                          ? (isExpired ? "⏰ Expirado" : blockedUntil.toLocaleString("es-ES"))
                          : "♾️ Permanente"
                        }
                      </td>
                      <td>
                        <button
                          className="btn-small"
                          onClick={() => desbloquearIP(ip.ip)}
                          style={{ background: "#00ff88", color: "#000", fontSize: "0.8rem" }}
                        >
                          ✅ Desbloquear
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}

      {tabActivaAdmin === "seguridad" && (
      <>
      {/* EVENTOS DE SEGURIDAD */}
      <section className="admin-section">
        <h3>🔒 Eventos de Seguridad</h3>

        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "15px",
            flexWrap: "wrap",
          }}
        >
          <select
            value={filtroEventoTipo}
            onChange={(e) => setFiltroEventoTipo(e.target.value)}
            style={{
              padding: "8px 12px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              color: "#fff",
              flex: "1 1 150px",
              minWidth: "120px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            <option value="" style={{ background: "#1a1a1a", color: "#fff" }}>
              Todos los tipos
            </option>
            <option value="VPN_DETECTED" style={{ background: "#1a1a1a", color: "#fff" }}>VPN Detectada</option>
            <option value="PROXY_DETECTED" style={{ background: "#1a1a1a", color: "#fff" }}>Proxy Detectado</option>
            <option value="TOR_DETECTED" style={{ background: "#1a1a1a", color: "#fff" }}>Tor Detectado</option>
            <option value="BLOCKED" style={{ background: "#1a1a1a", color: "#fff" }}>IP Bloqueada</option>
            <option value="HONEYPOT" style={{ background: "#1a1a1a", color: "#fff" }}>Bot Detectado</option>
            <option value="GEOFENCING" style={{ background: "#1a1a1a", color: "#fff" }}>Geofencing</option>
            <option value="BRUTE_FORCE" style={{ background: "#1a1a1a", color: "#fff" }}>Fuerza Bruta</option>
          </select>
          
          <input
            type="text"
            placeholder="Filtrar por IP..."
            value={filtroEventoIP}
            onChange={(e) => setFiltroEventoIP(e.target.value)}
            style={{
              padding: "10px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "14px",
              color: "#fff",
              flex: "1 1 150px",
              minWidth: "120px",
              fontSize: "0.85rem",
            }}
          />
          
          <input
            type="text"
            placeholder="Buscar..."
            value={filtroBusquedaEventos}
            onChange={(e) => setFiltroBusquedaEventos(e.target.value)}
            style={{
              padding: "10px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "14px",
              color: "#fff",
              flex: "1 1 150px",
              minWidth: "120px",
              fontSize: "0.85rem",
            }}
          />
          
          <button
            className="btn-small"
            onClick={cargarEventosSeguridad}
            disabled={loadingEventosSeguridad}
          >
            {loadingEventosSeguridad ? "Cargando..." : "🔄 Actualizar"}
          </button>
        </div>

        <div style={{ marginBottom: "10px", color: "#888", fontSize: "0.9rem" }}>
          Total de eventos: <strong>{totalEventosSeguridad}</strong>
        </div>

        {loadingEventosSeguridad ? (
          <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
            Cargando eventos de seguridad...
          </p>
        ) : eventosSeguridad.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
            No hay eventos de seguridad
          </p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table admin-table-auditoria">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Tipo de Evento</th>
                  <th>IP</th>
                  <th>Usuario ID</th>
                  <th>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {eventosSeguridad
                  .filter((e) => {
                    if (!filtroBusquedaEventos) return true;
                    const search = filtroBusquedaEventos.toLowerCase();
                    return (
                      (e.event_type && e.event_type.toLowerCase().includes(search)) ||
                      (e.ip && e.ip.toLowerCase().includes(search)) ||
                      (e.details && JSON.stringify(e.details).toLowerCase().includes(search))
                    );
                  })
                  .map((e) => {
                    const formatearFecha = (fechaStr) => {
                      if (!fechaStr) return "—";
                      try {
                        const fecha = new Date(fechaStr);
                        const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                        
                        const diaSemana = dias[fecha.getDay()];
                        const dia = fecha.getDate();
                        const mes = meses[fecha.getMonth()];
                        const año = fecha.getFullYear();
                        const horas = String(fecha.getHours()).padStart(2, '0');
                        const minutos = String(fecha.getMinutes()).padStart(2, '0');
                        
                        return `${diaSemana} ${dia} ${mes} ${año} ${horas}:${minutos}`;
                      } catch {
                        return fechaStr;
                      }
                    };

                    const obtenerColorEvento = (tipo) => {
                      if (tipo?.includes("VPN") || tipo?.includes("PROXY") || tipo?.includes("TOR")) {
                        return "#ffaa00";
                      }
                      if (tipo?.includes("BLOCKED") || tipo?.includes("BRUTE_FORCE")) {
                        return "#ff4444";
                      }
                      if (tipo?.includes("HONEYPOT")) {
                        return "#ff8800";
                      }
                      return "#00ff88";
                    };

                    const obtenerNombreEvento = (tipo) => {
                      const nombres = {
                        "VPN_DETECTED": "🔒 VPN Detectada",
                        "PROXY_DETECTED": "🔒 Proxy Detectado",
                        "TOR_DETECTED": "🔒 Tor Detectado",
                        "BLOCKED_CACHED": "🚫 IP Bloqueada",
                        "BLOCKED_BLACKLIST": "🚫 IP en Blacklist",
                        "HONEYPOT_TRIGGERED": "🤖 Bot Detectado",
                        "GEOFENCING_BLOCKED": "🌍 Bloqueo Geográfico",
                        "TIME_RESTRICTION_VIOLATION": "⏰ Fuera de Horario",
                        "IP_REPUTATION_BLOCKED": "⚠️ IP con Mala Reputación",
                        "SUSPICIOUS_DEVICE_ACTIVITY": "📱 Actividad Sospechosa",
                        "BRUTE_FORCE_LOCKED": "🔐 Fuerza Bruta"
                      };
                      return nombres[tipo] || tipo || "—";
                    };

                    return (
                      <tr key={e.id}>
                        <td style={{ fontSize: "0.8rem", color: "#00ff88", fontWeight: "500", whiteSpace: "nowrap" }}>
                          {formatearFecha(e.created_at)}
                        </td>
                        <td style={{ color: obtenerColorEvento(e.event_type), fontWeight: "600" }}>
                          {obtenerNombreEvento(e.event_type)}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                          {e.ip || "—"}
                        </td>
                        <td>
                          {e.user_id || "—"}
                        </td>
                        <td style={{ fontSize: "0.8rem", maxWidth: "300px", wordBreak: "break-word" }}>
                          {e.details ? (
                            <details style={{ cursor: "pointer" }}>
                              <summary style={{ color: "#888" }}>Ver detalles</summary>
                              <pre style={{ 
                                marginTop: "8px", 
                                padding: "8px", 
                                background: "rgba(0,0,0,0.3)",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                overflow: "auto",
                                maxHeight: "200px"
                              }}>
                                {JSON.stringify(e.details, null, 2)}
                              </pre>
                            </details>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}

      {tabActivaAdmin === "personalizacion" && (
        <Personalizacion serverUrl={serverUrl} pushToast={notify} />
      )}


      {tabActivaAdmin === "auditoria" && (
      <>
      {/* AUDITORÍA Y ACTIVIDAD */}
      <section className="admin-section">
        <h3>📊 Auditoría y Actividad</h3>

        {/* USUARIOS ACTIVOS */}
        <div style={{ marginBottom: "30px" }}>
          <h4 style={{ marginBottom: "15px", color: "#00ff88" }}>
            👥 Usuarios Activos ({usuariosActivos.length})
          </h4>
          {usuariosActivos.length === 0 ? (
            <p style={{ color: "#888" }}>No hay usuarios activos en este momento</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {usuariosActivos.map((u, idx) => (
                <div
                  key={idx}
                  className="user-active-badge"
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background: "#00ff88",
                      animation: "pulse 2s infinite",
                    }}
                  />
                  <strong>{u.nickname}</strong>
                  <span style={{ color: "#888", fontSize: "0.85rem" }}>
                    ({u.sockets} {u.sockets === 1 ? "dispositivo" : "dispositivos"})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HISTORIAL DE AUDITORÍA */}
        <div>
          <div
            className="admin-auditoria-filtros"
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "15px",
              flexWrap: "wrap",
            }}
          >
            {/* SELECTOR DE FECHA */}
            <div
              className="admin-auditoria-fecha"
              style={{ position: "relative", flex: "1 1 180px", minWidth: "180px" }}
            >
              <input
                type="date"
                value={filtroFecha}
                onChange={(e) => {
                  if (e.target.value) {
                    setFiltroFecha(e.target.value);
                  }
                }}
                className="admin-auditoria-control"
                style={{
                  padding: "10px 16px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "14px",
                  color: "#fff",
                  width: "100%",
                  fontSize: "0.85rem",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                }}
                title="Seleccionar fecha para filtrar auditoría"
                max={(() => {
                  const hoy = new Date();
                  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
                })()}
              />
              <div style={{ 
                marginTop: "4px", 
                fontSize: "0.75rem", 
                color: "#00ff88",
                textAlign: "center",
                fontWeight: "500"
              }}>
                📅 {(() => {
                  const hoy = new Date();
                  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
                  if (filtroFecha === fechaHoy) {
                    return "Hoy";
                  }
                  try {
                    const fechaSeleccionada = new Date(filtroFecha + "T00:00:00");
                    return fechaSeleccionada.toLocaleDateString('es-MX', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    });
                  } catch {
                    return filtroFecha;
                  }
                })()}
              </div>
            </div>
            
            {/* SELECTOR DE USUARIO */}
            <select
              className="admin-auditoria-control"
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              style={{
                padding: "8px 12px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                color: "#fff",
                flex: "1 1 150px",
                minWidth: "120px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              <option value="" style={{ background: "#1a1a1a", color: "#fff" }}>
                Todos los usuarios
              </option>
              {usuarios.map((u) => (
                <option 
                  key={u.id} 
                  value={u.name || u.nickname || u.phone}
                  style={{ background: "#1a1a1a", color: "#fff" }}
                >
                  {u.nickname || u.name || u.phone}
                </option>
              ))}
            </select>
            
            <input
              className="admin-auditoria-control"
              type="text"
              placeholder="Filtrar por acción..."
              value={filtroAccion}
              onChange={(e) => setFiltroAccion(e.target.value)}
              style={{
                padding: "10px 16px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "14px",
                color: "#fff",
                flex: "1 1 150px",
                minWidth: "120px",
                fontSize: "0.85rem",
                transition: "all 0.3s ease",
              }}
            />
            
            <input
              className="admin-auditoria-control"
              type="text"
              placeholder="Buscar en detalles..."
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              style={{
                padding: "10px 16px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "14px",
                color: "#fff",
                flex: "1 1 150px",
                minWidth: "120px",
                fontSize: "0.85rem",
                transition: "all 0.3s ease",
              }}
            />
            <button
              className="btn-small admin-auditoria-btn"
              onClick={cargarAuditoriaManual}
              disabled={loadingAuditoria}
            >
              {loadingAuditoria ? "Cargando..." : "🔄 Actualizar"}
            </button>
          </div>

          <div style={{ marginBottom: "10px", color: "#888", fontSize: "0.9rem" }}>
            Total de registros: <strong>{totalAuditoria}</strong>
          </div>

          {loadingAuditoria ? (
            <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
              Cargando auditoría...
            </p>
          ) : auditoria.length === 0 ? (
            <p style={{ color: "#888", textAlign: "center", padding: "20px" }}>
              No hay registros de auditoría
            </p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table admin-table-auditoria">
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>Usuario</th>
                    <th>Acción Realizada</th>
                    <th>Qué Editó/Hizo</th>
                    <th>Cambios Específicos</th>
                    <th>Dónde</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.map((a) => {
                    // Formatear fecha de manera más clara
                    const formatearFecha = (fechaStr) => {
                      if (!fechaStr) return "—";
                      try {
                        let fecha;
                        // Si ya tiene formato YYYY-MM-DD HH:MM:SS
                        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaStr)) {
                          const [datePart, timePart] = fechaStr.split(' ');
                          const [year, month, day] = datePart.split('-');
                          const [hours, minutes, seconds] = timePart.split(':');
                          fecha = new Date(year, month - 1, day, hours, minutes, seconds);
                        } else {
                          fecha = new Date(fechaStr);
                        }
                        
                        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                        
                        const diaSemana = dias[fecha.getDay()];
                        const dia = fecha.getDate();
                        const mes = meses[fecha.getMonth()];
                        const año = fecha.getFullYear();
                        const horas = String(fecha.getHours()).padStart(2, '0');
                        const minutos = String(fecha.getMinutes()).padStart(2, '0');
                        
                        return `${diaSemana}, ${dia} de ${mes} ${año} - ${horas}:${minutos}`;
                      } catch {
                        return fechaStr;
                      }
                    };

                    // Nombre más amigable de la tabla (nombres reales de pestañas)
                    const nombreTabla = (tabla) => {
                      const nombres = {
                        'usuarios': 'CEO',
                        'roles': 'CEO',
                        'permisos': 'CEO',
                        'devoluciones_pedidos': 'Devoluciones',
                        'devoluciones_productos': 'Devoluciones',
                        'devoluciones_calidad': 'Devoluciones',
                        'devoluciones_reacondicionados': 'Devoluciones',
                        'devoluciones_retail': 'Devoluciones',
                        'devoluciones_cubbo': 'Devoluciones',
                        'devoluciones_regulatorio': 'Devoluciones',
                        'reenvios': 'Reenvíos',
                        'productos_ref': 'Inventario',
                        'productos': 'Escaneo',
                        'sesiones': 'CEO',
                      };
                      return nombres[tabla] || tabla;
                    };

                    // Mejorar descripción de la acción - SOLO ACCIÓN Y PRODUCTO (sin pestaña/área)
                    const obtenerDescripcionAccion = () => {
                      const accion = a.accion || "";
                      const detalle = a.detalle || "";
                      
                      // Si hay detalle, extraer solo acción y producto
                      if (detalle) {
                        // Extraer nombre del producto (puede estar entre comillas simples o dobles)
                        const matchProducto = detalle.match(/['"]([^'"]+)['"]/);
                        
                        // Extraer acción específica del detalle
                        let accionEspecifica = "";
                        if (detalle.includes("Agregó producto") || detalle.includes("Agregó pedido")) {
                          accionEspecifica = detalle.includes("pedido") ? "Agregó pedido" : "Agregó producto";
                        } else if (detalle.includes("Editó producto") || detalle.includes("Editó pedido")) {
                          accionEspecifica = detalle.includes("pedido") ? "Editó pedido" : "Editó producto";
                        } else if (detalle.includes("Eliminó producto") || detalle.includes("Eliminó pedido")) {
                          accionEspecifica = detalle.includes("pedido") ? "Eliminó pedido" : "Eliminó producto";
                        } else if (detalle.includes("Surtió producto")) {
                          accionEspecifica = "Surtió producto";
                        } else if (detalle.includes("Actualizó cantidad")) {
                          accionEspecifica = "Actualizó cantidad de producto";
                        } else if (accion.includes("CREAR") || accion.includes("AGREGAR") || accion.includes("INSERT")) {
                          accionEspecifica = "Agregó";
                        } else if (accion.includes("EDITAR") || accion.includes("UPDATE")) {
                          accionEspecifica = "Editó";
                        } else if (accion.includes("BORRAR") || accion.includes("DELETE") || accion.includes("ELIMINAR")) {
                          accionEspecifica = "Eliminó";
                        } else if (accion.includes("SURTIR")) {
                          accionEspecifica = "Surtió producto";
                        } else {
                          accionEspecifica = "Modificó";
                        }
                        
                        // Si hay nombre de producto, construir descripción simple
                        if (matchProducto) {
                          const nombreProducto = matchProducto[1];
                          
                          // Extraer cambios específicos si es edición
                          let cambiosEspecificos = "";
                          if (detalle.includes("Cambios:")) {
                            const matchCambios = detalle.match(/Cambios:\s*(.+?)(?:\s+en pestaña|$)/i);
                            if (matchCambios) {
                              cambiosEspecificos = ` - Cambios: ${matchCambios[1].trim()}`;
                            }
                          }
                          
                          // Para pedidos, extraer información adicional
                          if (detalle.includes("pedido")) {
                            const matchGuia = detalle.match(/Guía:\s*([^,)]+)/i);
                            const matchPaqueteria = detalle.match(/Paquetería:\s*([^,)]+)/i);
                            const matchProductosCount = detalle.match(/con\s+(\d+)\s+productos?/i);
                            
                            let infoAdicional = "";
                            if (matchGuia && matchGuia[1] !== 'N/A') {
                              infoAdicional += ` (Guía: ${matchGuia[1].trim()})`;
                            }
                            if (matchPaqueteria && matchPaqueteria[1] !== 'N/A') {
                              infoAdicional += ` (Paquetería: ${matchPaqueteria[1].trim()})`;
                            }
                            if (matchProductosCount) {
                              infoAdicional += ` con ${matchProductosCount[1]} productos`;
                            }
                            
                            return `${accionEspecifica} "${nombreProducto}"${infoAdicional}${cambiosEspecificos}`;
                          }
                          
                          // Para productos, solo nombre y cambios si hay
                          return `${accionEspecifica} "${nombreProducto}"${cambiosEspecificos}`;
                        } else {
                          // Intentar buscar el nombre del producto en otros formatos
                          // Buscar patrones como "producto del día código X" o "producto código X"
                          const matchCodigoConNombre = detalle.match(/producto\s+["']([^"']+)["']/i) || 
                                                       detalle.match(/producto\s+([A-Za-z0-9\s]+?)\s+\(/i);
                          
                          if (matchCodigoConNombre) {
                            const nombreProducto = matchCodigoConNombre[1].trim();
                            return `${accionEspecifica} "${nombreProducto}"`;
                          }
                          
                          // Buscar si hay algún texto que pueda ser el nombre antes de "código" o "ID"
                          const matchNombreAntesCodigo = detalle.match(/([A-Za-z][A-Za-z0-9\s]{3,}?)\s+(?:código|Código|ID|id)/i);
                          if (matchNombreAntesCodigo && matchNombreAntesCodigo[1].trim().length > 3) {
                            const posibleNombre = matchNombreAntesCodigo[1].trim();
                            // Verificar que no sea solo una palabra genérica
                            if (!posibleNombre.match(/^(producto|pedido|devolución|registro)$/i)) {
                              return `${accionEspecifica} "${posibleNombre}"`;
                            }
                          }
                          
                          // Si no hay nombre, eliminar pestaña/área y código/ID pero mantener la acción
                          let descripcionLimpia = detalle;
                          
                          // Eliminar información de pestaña y área
                          descripcionLimpia = descripcionLimpia.replace(/\s*en pestaña\s+[^-]+/gi, "");
                          descripcionLimpia = descripcionLimpia.replace(/\s*-\s*Área:\s*[^,)]+/gi, "");
                          descripcionLimpia = descripcionLimpia.replace(/\s*-\s*Apartado:\s*[^,)]+/gi, "");
                          
                          // Eliminar código e ID
                          descripcionLimpia = descripcionLimpia.replace(/\(Código:\s*[^)]+\)/gi, "");
                          descripcionLimpia = descripcionLimpia.replace(/Código:\s*[A-Z0-9]+/gi, "");
                          descripcionLimpia = descripcionLimpia.replace(/\s*ID\s*\d+/gi, "");
                          descripcionLimpia = descripcionLimpia.replace(/\s*\(ID:\s*\d+\)/gi, "");
                          descripcionLimpia = descripcionLimpia.replace(/\s*producto\s*ID\s*\d+/gi, "producto");
                          descripcionLimpia = descripcionLimpia.replace(/\s*del día código\s+[A-Z0-9]+/gi, "");
                          
                          // Normalizar espacios
                          descripcionLimpia = descripcionLimpia.replace(/\s+/g, " ").trim();
                          
                          // Si después de limpiar queda algo útil, usarlo; si no, solo la acción
                          if (descripcionLimpia && descripcionLimpia.length > accionEspecifica.length + 5) {
                            return descripcionLimpia;
                          }
                          
                          return accionEspecifica;
                        }
                      }
                      
                      // Si no hay detalle, crear descripción simple basada en acción
                      let descripcion = "";
                      
                      if (accion.includes("CREAR") || accion.includes("AGREGAR") || accion.includes("INSERT")) {
                        descripcion = "Agregó registro";
                      } else if (accion.includes("EDITAR") || accion.includes("UPDATE")) {
                        descripcion = "Editó registro";
                      } else if (accion.includes("BORRAR") || accion.includes("DELETE") || accion.includes("ELIMINAR")) {
                        descripcion = "Eliminó registro";
                      } else if (accion.includes("SURTIR")) {
                        descripcion = "Surtió producto";
                      } else {
                        descripcion = accion || "Modificó";
                      }
                      
                      return descripcion;
                    };

                    // Obtener nombre de usuario - intentar varios campos
                    const obtenerNombreUsuario = () => {
                      if (a.usuario && a.usuario.trim() !== "") {
                        return a.usuario;
                      }
                      // Intentar extraer del detalle si está disponible
                      if (a.detalle) {
                        // Buscar patrones comunes como "por Usuario" o similar
                        const matchUsuario = a.detalle.match(/(?:por|de|usuario|user)[:\s]+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?:\s|$|,|\.)/i);
                        if (matchUsuario && matchUsuario[1] && matchUsuario[1].trim().length > 2) {
                          return matchUsuario[1].trim();
                        }
                      }
                      return "Sistema";
                    };

                    return (
                      <tr key={a.id}>
                        <td style={{ fontSize: "0.8rem", color: "#00ff88", fontWeight: "500", whiteSpace: "nowrap", padding: "8px 10px" }}>
                          {formatearFecha(a.fecha)}
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "break-word", overflow: "visible", boxSizing: "border-box" }}>
                          <strong style={{ color: "var(--texto-principal)", fontSize: "0.8rem" }}>{obtenerNombreUsuario()}</strong>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "break-word", overflow: "visible", boxSizing: "border-box" }}>
                          <span
                            style={{
                              background:
                                a.accion?.includes("BORRAR") || a.accion?.includes("DELETE") || a.accion?.includes("ELIMINAR")
                                  ? "rgba(255, 0, 0, 0.25)"
                                  : a.accion?.includes("EDITAR") || a.accion?.includes("UPDATE")
                                  ? "rgba(255, 200, 0, 0.25)"
                                  : a.accion?.includes("CREAR") || a.accion?.includes("AGREGAR") || a.accion?.includes("INSERT")
                                  ? "rgba(0, 255, 136, 0.25)"
                                  : "rgba(100, 150, 255, 0.25)",
                              color:
                                a.accion?.includes("BORRAR") || a.accion?.includes("DELETE") || a.accion?.includes("ELIMINAR")
                                  ? "#ff6b6b"
                                  : a.accion?.includes("EDITAR") || a.accion?.includes("UPDATE")
                                  ? "#ffd93d"
                                  : a.accion?.includes("CREAR") || a.accion?.includes("AGREGAR") || a.accion?.includes("INSERT")
                                  ? "#00ff88"
                                  : "#6ba3ff",
                              padding: "4px 8px",
                              borderRadius: "8px",
                              fontSize: "0.75rem",
                              fontWeight: "600",
                              display: "inline-block",
                              wordBreak: "break-word",
                              whiteSpace: "normal",
                            }}
                          >
                            {a.accion?.includes("CREAR") || a.accion?.includes("AGREGAR") || a.accion?.includes("INSERT")
                              ? "AGREGAR"
                              : a.accion?.includes("EDITAR") || a.accion?.includes("UPDATE")
                              ? "EDITAR"
                              : a.accion?.includes("BORRAR") || a.accion?.includes("DELETE") || a.accion?.includes("ELIMINAR")
                              ? "ELIMINAR"
                              : a.accion || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", wordBreak: "break-word", overflowWrap: "break-word", overflow: "visible", boxSizing: "border-box", color: "#e0e0e0", fontSize: "0.8rem", lineHeight: "1.5", whiteSpace: "normal" }}>
                          {obtenerDescripcionAccion()}
                        </td>
                        <td style={{ padding: "10px 12px", wordBreak: "break-word", overflowWrap: "break-word", overflow: "visible", boxSizing: "border-box", color: "#ffd93d", fontSize: "0.75rem", lineHeight: "1.5", fontWeight: "500", whiteSpace: "normal" }}>
                          {(() => {
                            const detalle = a.detalle || "";
                            // Buscar la sección de cambios específicos
                            if (detalle.includes("Cambios:")) {
                              const matchCambios = detalle.match(/Cambios:\s*(.+?)(?:\s*\||$)/i);
                              if (matchCambios) {
                                const cambios = matchCambios[1].trim();
                                // Formatear los cambios para mejor legibilidad
                                return cambios.split(' | ').map((cambio, idx) => (
                                  <div key={idx} style={{ marginBottom: "4px" }}>
                                    {cambio}
                                  </div>
                                ));
                              }
                            }
                            // Si no hay cambios específicos pero es una edición, mostrar "Sin cambios detectados" o información disponible
                            if (a.accion?.includes("EDITAR") || a.accion?.includes("UPDATE")) {
                              // Intentar extraer información del detalle
                              if (detalle.includes("|")) {
                                const partes = detalle.split("|");
                                if (partes.length > 1) {
                                  // Mostrar información adicional si existe
                                  return partes.slice(1).join(" | ").trim() || "—";
                                }
                              }
                              return "—";
                            }
                            return "—";
                          })()}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#b0b0b0", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                          {nombreTabla(a.tabla_afectada) || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      </>
      )}

      {/* GESTIÓN DE ROLES */}
      {tabActivaAdmin === "roles" && (
        <section className="admin-section">
          <div className="roles-header">
            <div className="roles-title-container">
              <h3 className="roles-title">🎭 Gestión de Roles</h3>
              <p className="roles-subtitle">
                Crea y configura roles con permisos predefinidos para tus usuarios
              </p>
            </div>
            <button
              className="btn-nuevo-rol"
              onClick={abrirModalNuevoRol}
            >
              <span>+</span> Nuevo Rol
            </button>
          </div>

          {roles.length === 0 ? (
            <div className="roles-empty">
              <span className="roles-empty-icon">🎭</span>
              <p>No hay roles configurados</p>
              <button className="btn-nuevo-rol" onClick={abrirModalNuevoRol}>
                Crear primer rol
              </button>
            </div>
          ) : (
            <div className="roles-grid">
              {/* Ordenar: CEO primero, luego el resto */}
              {[...roles].sort((a, b) => {
                if (a.name === "CEO") return -1;
                if (b.name === "CEO") return 1;
                return a.name.localeCompare(b.name);
              }).map((rol) => {
                const esCEO = rol.name === "CEO";
                const esAdmin = rol.name === "admin";
                
                return (
                  <div 
                    key={rol.id} 
                    className={`rol-card ${esCEO ? 'rol-card-ceo' : ''} ${esAdmin ? 'rol-card-admin' : ''}`}
                    onClick={() => abrirModalEditarRol(rol)}
                  >
                    <div className="rol-card-header">
                      <div className="rol-card-icon">
                        {esCEO ? '👑' : esAdmin ? '🛡️' : '👤'}
                      </div>
                      {esCEO && <span className="rol-badge-principal">Principal</span>}
                    </div>
                    <div className="rol-card-body">
                      <h4 className="rol-card-name">{rol.name}</h4>
                    </div>
                    <div className="rol-card-footer">
                      <button
                        className="rol-card-btn rol-card-btn-edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirModalEditarRol(rol);
                        }}
                      >
                        ✏️ Editar
                      </button>
                      {!esCEO && (
                        <button
                          className="rol-card-btn rol-card-btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            eliminarRol(rol);
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* MODAL EDITAR/CREAR ROL */}
      {modalRol && (
        <div className="modal-overlay" onClick={() => setModalRol(false)}>
          <div className="modal-content modal-rol-mejorado" onClick={(e) => e.stopPropagation()}>
            {/* Header del modal */}
            <div className="modal-rol-header">
              <div className="modal-rol-header-info">
                <span className="modal-rol-icon">
                  {rolEditando?.name === "CEO" ? '👑' : rolEditando?.name === "admin" ? '🛡️' : '🎭'}
                </span>
                <div>
                  <h3 className="modal-rol-title">
                    {rolEditando ? `Editar Rol` : "Crear Nuevo Rol"}
                  </h3>
                  {rolEditando && (
                    <span className="modal-rol-subtitle">{rolEditando.name}</span>
                  )}
                </div>
              </div>
              <button className="modal-close" onClick={() => setModalRol(false)}>×</button>
            </div>
            
            <div className="modal-rol-body">
              {/* Nombre del rol */}
              <div className="modal-rol-nombre-section">
                <label className="modal-rol-label">Nombre del Rol</label>
                <input
                  type="text"
                  className="modal-rol-input"
                  value={nombreRol}
                  onChange={(e) => setNombreRol(e.target.value)}
                  placeholder="Ej: Supervisor, Vendedor, etc."
                  disabled={rolEditando?.name === "CEO"}
                />
                {rolEditando?.name === "CEO" && (
                  <p className="modal-rol-hint">
                    👑 El rol CEO es el rol principal del sistema y no puede ser modificado ni eliminado.
                  </p>
                )}
              </div>

              {loadingPermsRol ? (
                <div className="modal-rol-loading">
                  <div className="loading-spinner"></div>
                  <p>Cargando permisos...</p>
                </div>
              ) : (
                <div className="modal-rol-permisos-container">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                    <h4 style={{ margin: 0 }}>Pestañas</h4>
                    <label className="perm-toggle-all" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={TAB_ORDER.filter(tab => permsAll.includes(tab)).every((tab) => permsDelRol.includes(tab))}
                          onChange={toggleAllTabsRol}
                        />
                        <span className="slider"></span>
                      </label>
                      <span>Seleccionar todas</span>
                      </label>
                    </div>
                  
                  {/* PESTAÑAS DESPLEGABLES */}
                  {TAB_ORDER.filter(tab => permsAll.includes(tab)).map((tab) => {
                    const estaAbierto = tabsAbiertos[tab];
                    const tienePermiso = permsDelRol.includes(tab);
                    const modulo = tabAModulo(tab);
                    const permisosModulo = PERMISOS_POR_MODULO[modulo];

                    return (
                      <div key={tab} className="perm-category-item">
                        <div
                          className="perm-category-header"
                          onClick={() => toggleTab(tab)}
                        >
                          <span className="perm-category-icon">
                            {estaAbierto ? "▼" : "▶"}
                          </span>
                          <span className="perm-category-title">
                            {TAB_LABELS[tab] || tab}
                          </span>
                        <label 
                            className="perm-toggle-all"
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center' }}
                        >
                            <label className="switch">
                          <input
                            type="checkbox"
                                checked={tienePermiso}
                            onChange={() => togglePermRol(tab)}
                          />
                              <span className="slider"></span>
                        </label>
                          </label>
                  </div>

                        {estaAbierto && permisosModulo && Object.keys(permisosModulo).length > 0 && (
                          <div className="perm-category-content">
                            {/* Switch para seleccionar todos los permisos del módulo */}
                            {(() => {
                              const permisosKeys = Object.keys(permisosModulo).filter(p => permsAll.includes(p));
                              const todosPermisosActivos = permisosKeys.every((perm) => permsDelRol.includes(perm));
                      
                      return (
                                <div style={{ 
                                  marginBottom: '12px', 
                                  paddingBottom: '12px', 
                                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px'
                                }}>
                                  {/* Switch para seleccionar todos los permisos */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label className="switch">
                              <input
                                type="checkbox"
                                        checked={todosPermisosActivos}
                                onChange={() => toggleAllModuloRol(modulo)}
                              />
                                      <span className="slider"></span>
                            </label>
                                    <span style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>
                                      Seleccionar todos los permisos
                                    </span>
                          </div>
                                </div>
                              );
                            })()}

                            {/* Permisos específicos de admin */}
                            {tab === "tab:admin" && (() => {
                              const adminPerms = permsAll.filter((p) => p.startsWith("admin."));
                              if (adminPerms.length === 0) return null;
                              return (
                                <div className="checkbox-grid" style={{ marginBottom: '12px' }}>
                                  {adminPerms.map((perm) => (
                                    <label key={perm} className="perm-item">
                                      <label className="switch">
                                <input
                                  type="checkbox"
                                  checked={permsDelRol.includes(perm)}
                                  onChange={() => togglePermRol(perm)}
                                />
                                        <span className="slider"></span>
                                      </label>
                                      <span>{ADMIN_PERM_LABELS[perm] || perm}</span>
                              </label>
                            ))}
                          </div>
                              );
                            })()}

                            {/* Mostrar permisos del módulo correspondiente a cada tab */}
                            <div className="checkbox-grid">
                              {Object.keys(permisosModulo)
                                .filter(perm => permsAll.includes(perm))
                                .map((perm) => {
                                  const tienePermisoPerm = permsDelRol.includes(perm);
                                  return (
                                    <label key={perm} className="perm-item">
                                      <label className="switch">
                                        <input
                                          type="checkbox"
                                          checked={tienePermisoPerm}
                                          onChange={() => togglePermRol(perm)}
                                        />
                                        <span className="slider"></span>
                                      </label>
                                      <span>{permisosModulo[perm] || perm}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
              )}
            </div>

            {/* Footer del modal */}
            <div className="modal-rol-footer">
              <button
                className="btn-cancelar"
                onClick={() => setModalRol(false)}
                disabled={savingRol}
              >
                Cancelar
              </button>
              <button
                className="btn-guardar-rol"
                onClick={guardarRol}
                disabled={savingRol || loadingPermsRol || !nombreRol.trim()}
              >
                {savingRol ? "Guardando..." : (rolEditando ? "💾 Guardar Cambios" : "✨ Crear Rol")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL USUARIO */}
      {modalUser && (
        <div className="admin-modal-backdrop" onClick={() => setModalUser(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "0" }}>{editUser ? `Editar Usuario: ${editUser.name}` : "Crear Nuevo Usuario"}</h3>

            {/* CÍRCULO DE FOTO DE PERFIL EN LA PARTE SUPERIOR - SIEMPRE VISIBLE - SIN CONDICIONES */}
            <div 
              className="foto-perfil-container" 
              style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                justifyContent: "center",
                marginBottom: "20px",
                marginTop: "15px",
                padding: "15px 20px",
                width: "100%",
                boxSizing: "border-box",
                visibility: "visible",
                opacity: 1,
                minHeight: "140px",
                position: "relative",
                zIndex: 10,
                background: "transparent",
                flexShrink: 0
              }}
            >
              <div style={{ position: "relative", marginBottom: "10px", width: "100px", height: "100px" }}>
                {previewFoto || (editUser?.photo ? `${serverUrl}/uploads/perfiles/${editUser.photo}?t=${editUser?.photoTimestamp || editUser?.id}` : null) ? (
                  <img
                    src={previewFoto || `${serverUrl}/uploads/perfiles/${editUser.photo}?t=${editUser?.photoTimestamp || editUser?.id}`}
                    alt="Foto de perfil"
                    style={{
                      width: "100px",
                      height: "100px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "3px solid #00ff88",
                      cursor: "pointer",
                      display: "block",
                      position: "absolute",
                      top: 0,
                      left: 0
                    }}
                    onClick={() => {
                      const fileInput = document.querySelector('.admin-modal input[type="file"]');
                      if (fileInput) fileInput.click();
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100px",
                      height: "100px",
                      borderRadius: "50%",
                      background: "rgba(0, 255, 136, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "40px",
                      border: "3px solid #00ff88",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      position: "absolute",
                      top: 0,
                      left: 0
                    }}
                    onClick={() => {
                      const fileInput = document.querySelector('.admin-modal input[type="file"]');
                      if (fileInput) fileInput.click();
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(0, 255, 136, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(0, 255, 136, 0.2)";
                    }}
                  >
                    👤
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="admin-modal-file-input"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    setFotoPerfil(file);
                    if (file) setPreviewFoto(URL.createObjectURL(file));
                  }}
                />
              </div>
              <span style={{ 
                color: "#00ff88", 
                fontSize: "0.85rem", 
                cursor: "pointer",
                textDecoration: "underline",
                display: "block",
                marginTop: "5px",
                visibility: "visible",
                opacity: 1
              }}
              onClick={() => {
                const fileInput = document.querySelector('.admin-modal input[type="file"]');
                if (fileInput) fileInput.click();
              }}
              >
                {previewFoto || editUser?.photo ? "Cambiar foto" : "Agregar foto"}
              </span>
            </div>

            {/* PESTAÑAS DEL MODAL */}
            <div className="admin-modal-tabs">
              <button
                className={modalTab === "usuario" ? "active" : ""}
                onClick={() => setModalTab("usuario")}
              >
                Usuario
              </button>
              <button
                className={modalTab === "roles" ? "active" : ""}
                onClick={() => setModalTab("roles")}
              >
                Roles
              </button>
              <button
                className={modalTab === "permisos" ? "active" : ""}
                onClick={() => setModalTab("permisos")}
              >
                Permisos
              </button>
              <button
                className={modalTab === "confirmacion" ? "active" : ""}
                onClick={() => setModalTab("confirmacion")}
              >
                🔐 Confirmación
              </button>
            </div>

            {/* CONTENIDO SEGÚN PESTAÑA */}
            <div className="admin-modal-content">
              {modalTab === "usuario" && (
                <>
                  {/* Dos inputs por línea */}
                  <div className="form-row-duo">
                    <div className="form-row">
                      <label>Nombre</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nombre completo"
                      />
                    </div>
                    <div className="form-row">
                      <label>Sobrenombre (Nickname)</label>
                      <input
                        type="text"
                        value={editNickname}
                        onChange={(e) => setEditNickname(e.target.value)}
                        placeholder="Sobrenombre o apodo (opcional)"
                      />
                    </div>
                  </div>

                  <div className="form-row-duo">
                    <div className="form-row">
                      <label>Teléfono</label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Número de teléfono"
                      />
                    </div>
                    <div className="form-row">
                      <label>Usuario (para login con contraseña)</label>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        placeholder="Nombre de usuario (opcional)"
                      />
                    </div>
                  </div>

                  {/* Switch, input de contraseña y botón en la misma línea */}
                  {editUser && (
                    <div className="form-row-triple" style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      <div className="form-row-switch">
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={!!editActive}
                              onChange={(e) => setEditActive(e.target.checked ? 1 : 0)}
                            />
                            <span className="slider"></span>
                          </label>
                          <span>Usuario activo</span>
                        </label>
                      </div>
                      <div className="form-row" style={{ flex: 1, margin: 0 }}>
                        <input
                          type="password"
                          value={tempPasswordInput}
                          onChange={(e) => setTempPasswordInput(e.target.value)}
                          placeholder="Nueva contraseña temporal (mín. 6)"
                          style={{ margin: 0 }}
                        />
                      </div>
                      <div className="form-row-button" style={{ margin: 0 }}>
                        <button
                          className="btn-warning"
                          onClick={restablecerContraseña}
                          disabled={resettingPassword || !tempPasswordInput || tempPasswordInput.length < 6}
                          style={{
                            padding: "10px 16px",
                            background: "linear-gradient(135deg, #ffc107, #ff9800)",
                            border: "none",
                            borderRadius: "10px",
                            color: "#000",
                            fontWeight: "600",
                            cursor: resettingPassword || !tempPasswordInput || tempPasswordInput.length < 6 ? "not-allowed" : "pointer",
                            opacity: resettingPassword || !tempPasswordInput || tempPasswordInput.length < 6 ? 0.5 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {resettingPassword ? "Restableciendo..." : "Restablecer"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {modalTab === "roles" && (
                <>
                  <h4>Roles</h4>
                  <div className="checkbox-grid">
                    {roles.map((r) => (
                      <label key={r.id}>
                        <input
                          type="checkbox"
                          checked={editRoles.includes(r.name)}
                          onChange={() => toggleRole(r.name)}
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </>
              )}

              {modalTab === "permisos" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                    <h4>Pestañas</h4>
                    <label className="perm-toggle-all" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={todasPestañasActivas}
                          onChange={toggleAllTabs}
                        />
                        <span className="slider"></span>
                      </label>
                      <span>Seleccionar todas</span>
                    </label>
                  </div>
                  
                  {/* PESTAÑAS DESPLEGABLES */}
                  {tabsOrdenados.map((tab) => {
                    const estaAbierto = tabsAbiertos[tab];
                    const tienePermiso = editPerms.includes(tab);

                    return (
                      <div key={tab} className="perm-category-item">
                        <div
                          className="perm-category-header"
                          onClick={() => toggleTab(tab)}
                        >
                          <span className="perm-category-icon">
                            {estaAbierto ? "▼" : "▶"}
                          </span>
                          <span className="perm-category-title">
                            {TAB_LABELS[tab] || tab}
                          </span>
                          <label 
                            className="perm-toggle-all"
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center' }}
                          >
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={tienePermiso}
                                onChange={() => togglePerm(tab)}
                              />
                              <span className="slider"></span>
                            </label>
                          </label>
                        </div>
                        
                        {estaAbierto && (
                          <div className="perm-category-content">
                            {/* Switch para seleccionar todos los permisos del módulo */}
                            {(() => {
                              const modulo = tabAModulo(tab);
                              const permisosModulo = PERMISOS_POR_MODULO[modulo];
                              
                              if (!permisosModulo || Object.keys(permisosModulo).length === 0) {
                                return null;
                              }

                              const permisosKeys = Object.keys(permisosModulo);
                              const todosPermisosActivos = permisosKeys.every((perm) => editPerms.includes(perm));

                              // Obtener visibilidad de la pestaña (tab)
                              const visibilidadTab = visibilidadPestañas[tab] || { visible_tablet: 1, visible_celular: 1 };

                              return (
                                <div style={{ 
                                  marginBottom: '12px', 
                                  paddingBottom: '12px', 
                                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px'
                                }}>
                                  {/* Switch para seleccionar todos los permisos */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label className="switch">
                                      <input
                                        type="checkbox"
                                        checked={todosPermisosActivos}
                                        onChange={() => toggleAllPermisosModulo(modulo)}
                                      />
                                      <span className="slider"></span>
                                    </label>
                                    <span style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>
                                      Seleccionar todos los permisos
                                    </span>
                                  </div>
                                  
                                  {/* Switches de visibilidad en dispositivos (solo para tabs) */}
                                  {tab.startsWith('tab:') && (
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '16px',
                                      marginLeft: '32px',
                                      paddingTop: '8px',
                                      borderTop: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label className="switch">
                                          <input
                                            type="checkbox"
                                            checked={visibilidadTab.visible_tablet === 1}
                                            onChange={(e) => actualizarVisibilidadPestaña(tab, 'visible_tablet', e.target.checked)}
                                          />
                                          <span className="slider"></span>
                                        </label>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--texto-secundario)' }}>
                                          📱 Tablet
                                        </span>
                                      </div>
                                      
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label className="switch">
                                          <input
                                            type="checkbox"
                                            checked={visibilidadTab.visible_celular === 1}
                                            onChange={(e) => actualizarVisibilidadPestaña(tab, 'visible_celular', e.target.checked)}
                                          />
                                          <span className="slider"></span>
                                        </label>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--texto-secundario)' }}>
                                          📱 Celular
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Permisos específicos de admin */}
                            {tab === "tab:admin" && (
                              <div className="checkbox-grid">
                                {adminPerms.map((perm) => (
                                  <label key={perm} className="perm-item">
                                    <label className="switch">
                                      <input
                                        type="checkbox"
                                        checked={editPerms.includes(perm)}
                                        onChange={() => togglePerm(perm)}
                                      />
                                      <span className="slider"></span>
                                    </label>
                                    <span>{ADMIN_PERM_LABELS[perm] || perm}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            
                            {/* Permiso de activar/desactivar productos para estas pestañas */}
                            {(tab === "tab:devoluciones" || tab === "tab:inventario" || tab === "tab:activaciones") && editPerms && (
                              <div className="checkbox-grid">
                                <label className="perm-item">
                                  <label className="switch">
                                    <input
                                      type="checkbox"
                                      checked={editPerms.includes("action:activar-productos")}
                                      onChange={() => togglePerm("action:activar-productos")}
                                    />
                                    <span className="slider"></span>
                                  </label>
                                  <span>Activar/Desactivar productos</span>
                                </label>
                              </div>
                            )}

                            {/* Mostrar permisos del módulo correspondiente a cada tab en grid */}
                            {(() => {
                              const modulo = tabAModulo(tab);
                              const permisosModulo = PERMISOS_POR_MODULO[modulo];
                              
                              if (!permisosModulo || Object.keys(permisosModulo).length === 0) {
                                return null;
                              }

                              return (
                                <div className="checkbox-grid">
                                  {Object.keys(permisosModulo).map((perm) => {
                                    const tienePermiso = editPerms.includes(perm);
                                    return (
                                      <label key={perm} className="perm-item">
                                        <label className="switch">
                                          <input
                                            type="checkbox"
                                            checked={tienePermiso}
                                            onChange={() => togglePerm(perm)}
                                          />
                                          <span className="slider"></span>
                                        </label>
                                        <span>{permisosModulo[perm] || perm}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {modalTab === "confirmacion" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "15px", backgroundColor: "rgba(0, 255, 136, 0.08)", borderRadius: "8px", marginBottom: "20px" }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={editPerms.includes("admin.confirmacion.recibir_codigos")}
                        onChange={() => togglePerm("admin.confirmacion.recibir_codigos")}
                      />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: "600", color: "#00ff88" }}>Activar confirmación por código</span>
                  </div>
                  <p style={{ color: "var(--texto-secundario)", fontSize: "0.9rem", marginTop: "10px" }}>
                    Cuando esté activado, recibirás códigos temporales vía chat para confirmar acciones.
                  </p>
                </>
              )}
            </div>

            {/* BOTONES */}
            <div className="modal-actions">
              <button className="btn-primary" onClick={guardarUsuario} disabled={savingUser}>
                {savingUser ? "Guardando..." : "Guardar cambios"}
              </button>
              <button className="btn-danger" onClick={() => {
                setModalUser(false);
                // setNipEdicion(""); - Removed NIP system
              }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔵 MODAL SESIONES ABIERTAS */}
      {modalSesiones && (
        <div className="admin-modal-backdrop" onClick={() => setModalSesiones(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sesiones abiertas de {editUser?.nickname || editUser?.name}</h3>

            {loadingSesiones ? (
              <p>Cargando sesiones…</p>
            ) : sesionesUsuario.length === 0 ? (
              <p>Este usuario no tiene sesiones abiertas</p>
            ) : (
              <ul className="session-list">
                {sesionesUsuario.map((s) => (
                  <li key={s.id} className="session-item">
                    <div>
                      <strong>ID:</strong> {s.id} <br />
                      <strong>Token:</strong> {s.token.slice(0, 25)}... <br />
                      <strong>Fecha:</strong> {s.created_at}
                    </div>
                    <button
                      className="btn-small btn-danger"
                      onClick={() => cerrarSesion(s.id)}
                    >
                      Cerrar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="modal-actions">
              {sesionesUsuario.length > 0 && (
                <button className="btn-danger" onClick={cerrarTodas}>
                  Cerrar todas
                </button>
              )}
              <button className="btn-primary" onClick={() => setModalSesiones(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR ROL */}
      {modalRole && editRole && (
        <div className="admin-modal-backdrop" onClick={cerrarModalRol}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar Rol: {editRole.name}</h3>

            {/* Nombre del rol */}
            <div className="form-group">
              <label>Nombre del Rol:</label>
              <input
                type="text"
                value={editRoleName}
                onChange={(e) => setEditRoleName(e.target.value)}
                placeholder="Nombre del rol"
                disabled={editRole.name === 'admin'} // No permitir cambiar nombre del rol admin
              />
            </div>

            {/* Permisos del rol */}
            <div style={{ marginTop: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h4>Permisos del Rol</h4>
                <label className="perm-toggle-all" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={tabsOrdenados.every((tab) => editRolePerms.includes(tab))}
                      onChange={toggleAllTabsRol}
                    />
                    <span className="slider"></span>
                  </label>
                  <span>Seleccionar todas las pestañas</span>
                </label>
              </div>

              {/* PESTAÑAS DESPLEGABLES */}
              {tabsOrdenados.map((tab) => {
                const estaAbierto = tabsAbiertos[tab];
                const tienePermiso = editRolePerms.includes(tab);
                const modulo = tabAModulo(tab);
                const permisosModulo = PERMISOS_POR_MODULO[modulo];

                return (
                  <div key={tab} className="perm-category-item">
                    <div
                      className="perm-category-header"
                      onClick={() => toggleTab(tab)}
                    >
                      <span className="perm-category-icon">
                        {estaAbierto ? "▼" : "▶"}
                      </span>
                      <label className="perm-category-label">
                        <input
                          type="checkbox"
                          checked={tienePermiso}
                          onChange={() => togglePermisoRol(tab)}
                        />
                        <span className="perm-category-name">
                          {TAB_LABELS[tab] || tab.replace("tab:", "").toUpperCase()}
                        </span>
                      </label>
                    </div>

                    {estaAbierto && permisosModulo && Object.keys(permisosModulo).length > 0 && (
                      <div className="perm-subitems">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <span style={{ fontSize: "0.9rem", color: "#888" }}>
                            Permisos específicos del módulo:
                          </span>
                          <label className="perm-toggle-all" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={Object.keys(permisosModulo).every((perm) => editRolePerms.includes(perm))}
                                onChange={() => toggleAllPermisosModuloRol(modulo)}
                              />
                              <span className="slider"></span>
                            </label>
                            <span>Seleccionar todos</span>
                          </label>
                        </div>

                        {Object.entries(permisosModulo).map(([perm, desc]) => (
                          <label key={perm} className="perm-subitem">
                            <input
                              type="checkbox"
                              checked={editRolePerms.includes(perm)}
                              onChange={() => togglePermisoRol(perm)}
                            />
                            <span className="perm-subitem-text">
                              {desc || perm}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* BOTONES */}
            <div className="modal-actions">
              <button className="btn-primary" onClick={guardarRol}>
                Guardar cambios
              </button>
              <button className="btn-danger" onClick={cerrarModalRol}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 MODAL: CONTRASEÑA PARA NUEVO USUARIO */}
      {modalPasswordNuevoUsuario && nuevoUsuarioCreado && (
        <div className="admin-modal-backdrop" onClick={() => setModalPasswordNuevoUsuario(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "450px" }}>
            <h3>Establecer Contraseña Temporal</h3>
            <p style={{ color: "#aaa", marginBottom: "20px" }}>
              Usuario: <strong>{nuevoUsuarioCreado.name}</strong>
            </p>

            <div className="form-row" style={{ marginBottom: "20px" }}>
              <label>Contraseña Temporal (mín. 6 caracteres)</label>
              <input
                type="password"
                value={passwordNuevoUsuario}
                onChange={(e) => setPasswordNuevoUsuario(e.target.value)}
                placeholder="Ingresa una contraseña temporal"
                onKeyPress={(e) => {
                  if (e.key === "Enter" && passwordNuevoUsuario.length >= 6) {
                    guardarPasswordNuevoUsuario();
                  }
                }}
              />
            </div>

            <div className="modal-actions">
              <button 
                className="btn-primary" 
                onClick={guardarPasswordNuevoUsuario}
                disabled={guarandoPasswordNuevoUsuario || !passwordNuevoUsuario || passwordNuevoUsuario.length < 6}
                style={{
                  opacity: (guarandoPasswordNuevoUsuario || !passwordNuevoUsuario || passwordNuevoUsuario.length < 6) ? 0.5 : 1,
                  cursor: (guarandoPasswordNuevoUsuario || !passwordNuevoUsuario || passwordNuevoUsuario.length < 6) ? "not-allowed" : "pointer",
                }}
              >
                {guarandoPasswordNuevoUsuario ? "Guardando..." : "Guardar y Activar"}
              </button>
              <button 
                className="btn-danger" 
                onClick={() => {
                  setModalPasswordNuevoUsuario(false);
                  setNuevoUsuarioCreado(null);
                  setPasswordNuevoUsuario("");
                }}
                disabled={guarandoPasswordNuevoUsuario}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NIP Modal removed - using temporary codes via chat instead */}

      {/* MODAL DE CONFIRMACIÓN CON CÓDIGO */}
      <ConfirmationCodeModal
        isOpen={showConfirmationCodeModal}
        onClose={() => {
          setShowConfirmationCodeModal(false);
          setConfirmationCodeAction(null);
        }}
        onConfirm={handleConfirmationCodeConfirmed}
        accion={confirmationCodeAction?.accion}
        detalles={confirmationCodeAction?.detalles}
        loading={confirmingAction}
      />
    </div>
  );
}

export default React.memo(Administrador);
