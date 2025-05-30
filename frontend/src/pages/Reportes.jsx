import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import '../styles/Reportes.css';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../utils/websocket';


function Reportes() {
  const { user } = useUser();
  const usuario = user?.correo;
  const empresa = user?.empresa || 'Empresa no definida';

  const navigate = useNavigate();
  const [reportes, setReportes] = useState([]);
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null);

  useEffect(() => {
    const cargarReportes = async () => {
      try {
        const response = await fetch(
          `https://backend-inventario-t3yr.onrender.com/reportes?usuario=${user.correo}&empresa=${user.empresa}`
        );
        const data = await response.json();
        setReportes(data);
      } catch (error) {
        console.error('Error al cargar reportes:', error);
      }
    };

    cargarReportes();
  }, [user]);

  useEffect(() => {
    const ahora = new Date();
    const tresMesesMs = 1000 * 60 * 60 * 24 * 90;
    const todos = JSON.parse(localStorage.getItem(`reportesComparacion_${empresa}`)) || [];
    const propios = todos.filter(
      r => r.usuario === user.username && r.empresa === user.empresa && ahora - new Date(r.fecha) <= tresMesesMs
    );

    setReportes(prev => [...prev, ...propios]);
  }, [empresa]);

  const exportarReporte = (reporte) => {
    const agregarInfo = (item, tipo) => ({
      Nombre: item.Nombre || '-',
      Codigo: item.Codigo || '-',
      SKU: item.SKU || '-',
      Marca: item.Marca || '-',
      RFID: String(item.RFID || item.Codigo || '-'),
      Ubicacion: item.Ubicacion || '-',
      Estado: item.Estado || tipo, // como fallback
      Fecha: reporte.fecha,
      Usuario: reporte.usuario,
    });

    const data = ['encontrados', 'faltantes', 'no_registrados']
      .flatMap(tipo =>
        (reporte[tipo] || []).map(item => agregarInfo(item, tipo))
      );

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    const Nombre = `Reporte_${reporte.usuario}_${reporte.fecha.replace(/[\/:, ]/g, '_')}.xlsx`;
    XLSX.writeFile(wb, Nombre);
  };

  const handleEliminarReporteActual = async () => {
    if (!reporteSeleccionado || !reporteSeleccionado.id) return;
  
    const confirmacion = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Este reporte será eliminado definitivamente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
  
    if (!confirmacion.isConfirmed) return;
  
    try {      // 1. Eliminar del backend
      const usuario = user?.correo;
      const empresa = user?.empresa;

      const response = await fetch('https://backend-inventario-t3yr.onrender.com/reportes/todos', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ usuario, empresa }),
      });
      
      
      
      if (!response.ok) throw new Error('No se pudo eliminar del backend');
      
  
      // 2. Eliminar también del localStorage (con clave por empresa)
      const todos = JSON.parse(localStorage.getItem(`reportesComparacion_${empresa}`)) || [];
      const filtrados = todos.filter(r => r.fecha !== reporteSeleccionado.fecha || r.usuario !== reporteSeleccionado.usuario);
      localStorage.setItem(`reportesComparacion_${empresa}`, JSON.stringify(filtrados));
  
      // 3. Actualizar la lista en pantalla
      setReportes(prev => prev.filter(r => r.id !== reporteSeleccionado.id));
      setReporteSeleccionado(null);
  
      Swal.fire('Eliminado', 'Reporte eliminado correctamente.', 'success');
    } catch (error) {
      console.error('Error al eliminar:', error);
      Swal.fire('Error', 'No se pudo eliminar el reporte del backend.', 'error');
    }
  };

  const eliminarReporte = () => {
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esto eliminará todos tus reportes guardados del navegador y del servidor.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          
          // 1. Eliminar todos los reportes del backend para este usuario y empresa
          const response = await fetch('https://backend-inventario-t3yr.onrender.com/reportes/todos', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usuario, empresa }),
          });

          if (!response.ok) throw new Error('Error al eliminar del backend');

          // 2. Eliminar todos los reportes del localStorage para este usuario
          const todos = JSON.parse(localStorage.getItem(`reportesComparacion_${empresa}`)) || [];
          const filtrados = todos.filter(r => r.usuario !== user.username || r.empresa !== user.empresa);
          localStorage.setItem(`reportesComparacion_${empresa}`, JSON.stringify(filtrados));

          // 3. Limpiar la lista actual en pantalla
          setReportes([]);
          setReporteSeleccionado(null);

          Swal.fire('Eliminados', 'Tus reportes han sido eliminados de todos lados.', 'success');
        } catch (error) {
          console.error('Error al limpiar reportes:', error);
          Swal.fire('Error', 'No se pudieron eliminar los reportes del servidor.', 'error');
        }
      }
    });
  };

  const handleLogout = () => {
    Swal.fire({
      title: '¿Cerrar sesión?',
      text: '¿Estás seguro que deseas salir?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        localStorage.removeItem('usuario');
        navigate('/');
      }
    });
  };

  const handleVolver = () => navigate('/dashboard');
  
  function parseIfString(data) {
    try {
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      console.error('Error al parsear JSON:', e);
      return [];
    }
  }
  
  return (
    <div className="reporte-container">
      <div className="control-header">
        <div className="left-actions">
          <button className="btn-regresar" onClick={handleVolver}>Regresar</button>
        </div>
        <div className="user-info">
          <span className="user-icon">👤</span>
          <span className="username">{empresa}</span>
          <button className="btn-logout" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </div>

      <h2>Reportes de Comparación</h2>

      <div className="barra-reportes">
        <select value={reporteSeleccionado ? reporteSeleccionado.fecha : ''} 
        onChange={(e) => {
          const seleccionado = reportes.find(r => r.fecha === e.target.value);
          if (seleccionado) {
            setReporteSeleccionado({
              ...seleccionado,
              encontrados: parseIfString(seleccionado.encontrados),
              faltantes: parseIfString(seleccionado.faltantes),
              no_registrados: parseIfString(seleccionado.no_registrados),
            });
          }
        }}
        
        >
          <option value="">Selecciona un reporte</option>
          {reportes.map((r, i) => (
           <option key={i} value={r.fecha}>
           {r.fecha} - {r.usuario}
         </option>
         
          ))}
        </select>
        <button className="btn-limpiar-reportes" onClick={eliminarReporte}>Limpiar Mis Reportes</button>
      </div>

      {reporteSeleccionado && (
        <div className="tabla-contenedor">
          <div className="acciones-reporte">
            <button onClick={() => exportarReporte(reporteSeleccionado)}>Exportar Reporte</button>
            <button onClick={handleEliminarReporteActual} className="btn-eliminar-reporte"> Eliminar Este Reporte
            </button>

          </div>

          <table className="tabla-comparacion">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>SKU</th>
                <th>Marca</th>
                <th>RFID</th>
                <th>Ubicación</th>
                <th>Cantidad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
  {['encontrados', 'faltantes', 'no_registrados'].flatMap(tipo =>
    (reporteSeleccionado?.[tipo] || []).map((item, index) => (
      <tr key={`${tipo}-${index}`}>
        <td>{item.Nombre || item.Nombre || '-'}</td>
        <td>{item.Codigo || item.Codigo || item['Código'] || item['Código Barras'] || '-'}</td>
        <td>{item.SKU || item.SKU || '-'}</td>
        <td>{item.Marca || item.Marca || '-'}</td>
        <td>{item.RFID || item.RFID || item.Codigo || '-'}</td>
        <td>{item.Ubicacion || item.ubicacion || item['Ubicación'] || '-'}</td>
        <td>{item.Cantidad || '-'}</td>
        <td>{item.Estado || item.Estado || tipo}</td>
      </tr>
    ))
  )}
</tbody>



          </table>
        </div>
      )}
    </div>
  );
}

export default Reportes;
