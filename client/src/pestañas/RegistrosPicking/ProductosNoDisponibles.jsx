import React, { useState, useEffect } from "react";
import "./RegistrosPicking.css";
import { authFetch } from "../../AuthContext";

export default function ProductosNoDisponibles({
  SERVER_URL,
  pushToast,
  canal,
}) {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);

  const canalActual = (canal || "picking").toString().trim().toLowerCase();

  // Cargar productos no disponibles
  const cargarProductos = async () => {
    try {
      setLoading(true);
      const data = await authFetch(
        `${SERVER_URL}/productos/no-disponibles?canal=${canalActual}`
      );
      setProductos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando productos no disponibles:", err);
      pushToast?.("❌ Error cargando productos", "err");
      setProductos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarProductos();
    
    // Recargar cada 30 segundos
    const interval = setInterval(cargarProductos, 30000);
    return () => clearInterval(interval);
  }, [canalActual]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>⏳ Cargando...</div>;
  }

  if (!productos || productos.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>✅ No hay productos no disponibles</div>;
  }

  return (
    <div className="registros-picking-table-wrapper">
      <table className="tabla-registros">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Cantidad</th>
            <th>Lote</th>
            <th>Motivo</th>
            <th>Hora</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id} className="producto-no-disponible">
              <td><strong>{p.codigo}</strong></td>
              <td>{p.nombre || "Sin nombre"}</td>
              <td>
                {p.cajas > 0 && `${p.cajas} caja${p.cajas === 1 ? '' : 's'} `}
                {p.piezas > 0 && `${p.piezas} pza${p.piezas === 1 ? '' : 's'}`}
                {p.extras > 0 && ` +${p.extras}`}
              </td>
              <td>{p.lote || "N/A"}</td>
              <td>{p.observaciones || "No disponible"}</td>
              <td>{p.hora_solicitud || "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

