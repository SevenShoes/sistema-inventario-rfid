import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useInventario } from '../context/InventarioContext';
import { useUser } from '../context/UserContext';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import '../styles/ControlInventario.css';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import RFIDListener from './RFIDListener';
import { getSocket } from '../utils/websocket';






function ControlInventario() {
  const { logout } = useUser();
  const { inventarioBase, setInventarioBase } = useInventario();
  const { user } = useUser();
  const empresa = user?.empresa || 'Empresa no definida';
  const username = user?.correo || 'Usuario no definido';
  const [escaneoActivo, setEscaneoActivo] = useState(false);




  const navigate = useNavigate();

  const [escaneados, setEscaneados] = useState(() => {
    const saved = localStorage.getItem(`escaneados_${empresa}`);
    return saved ? JSON.parse(saved) : [];
  });
  const codigosSet = useRef(new Set(escaneados.map(e => String(e.codigo))));

  const [comparacion, setComparacion] = useState(() => {
    const saved = localStorage.getItem(`comparacion_${empresa}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        encontrados: parsed.encontrados || [],
        faltantes: parsed.faltantes || [],
        no_registrados: parsed.no_registrados || [],
      };
    }
    return null;
  });
  
  const [fechaComparacion, setFechaComparacion] = useState(() => {
    const saved = localStorage.getItem(`fechaComparacion_${empresa}`);
    return saved || null;
  });
  
  
  const enviarReporteAlBackend = async (reporte) => {
    try {
      const response = await fetch("https://backend-inventario-t3yr.onrender.com/reportes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(reporte)
      });
  
      if (!response.ok) {
        throw new Error("Error al guardar el reporte en el backend");
      }
  
      const data = await response.json();
      console.log("Reporte guardado correctamente:", data);
    } catch (error) {
      console.error("Error al enviar reporte:", error);
    }
  };
  

  const [isProcessing, setIsProcessing] = useState(false);
  const [mostrarImportados, setMostrarImportados] = useState(false);

  const onEtiquetaLeida = useCallback((codigo) => {
    const codigoStr = String(codigo);
    if (!codigosSet.current.has(codigoStr)) {
      codigosSet.current.add(codigoStr);
      setEscaneados(prev => {
        const nuevos = [...prev, { codigo: codigoStr }];
        localStorage.setItem(`escaneados_${empresa}`, JSON.stringify(nuevos));
        return nuevos;
      });
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(`inventarioBase_${empresa}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setInventarioBase(parsed);
    } else {
      setInventarioBase([]);
    }
  }, [setInventarioBase]);

  useEffect(() => {
    let ws = new WebSocket("wss://rfid-websocket-server-production.up.railway.app");
    ws.onopen = () => console.log('[RFIDListener] WebSocket conectado');
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.codigo) onEtiquetaLeida(parsed.codigo);
      } catch (err) {
        console.error('[RFIDListener] Error al parsear mensaje:', err);
      }
    };
    ws.onerror = (err) => console.error('[RFIDListener] Error de WebSocket:', err);
    ws.onclose = () => {
      console.warn('[RFIDListener] Conexión WebSocket cerrada. Reintentando...');
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws = new WebSocket("wss://rfid-websocket-server-production.up.railway.app");
        }
      }, 5000);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [onEtiquetaLeida]);

  const handleBack = () => navigate('/dashboard');

  const handleLogout = () => {
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'Vas a cerrar sesión',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed) {
        logout(); // ✅ Llama al método del contexto
        navigate('/');
      }
    });
  };
  

  const handleComparar = () => {
    setMostrarImportados(false);
    const actualBase = localStorage.getItem(`inventarioBase_${empresa}`);
    const base = actualBase ? JSON.parse(actualBase) : [];

    if (base.length === 0) {
      Swal.fire('Error', 'Primero debes cargar el inventario base', 'error');
      return;
    }

    setInventarioBase(base);
    setIsProcessing(true);

    const encontrados = [];
    const no_registrados = [];
    const faltantesMap = new Map(base.map(item => [String(item.RFID), item]));

    const nuevosEscaneados = escaneados.map(scan => {
      const codigo = String(scan.codigo);
      if (faltantesMap.has(codigo)) {
        const encontrado = faltantesMap.get(codigo);
        encontrados.push({ ...encontrado, Estado: 'Encontrado' });
        faltantesMap.delete(codigo);
        return { ...scan, Estado: 'Encontrado' };
      } else {
        no_registrados.push({ RFID: codigo, Estado: 'Sobrante' });
        return { ...scan, Estado: 'Sobrante' };
      }
    });

    const faltantesMarcados = Array.from(faltantesMap.values()).map(item => ({ ...item, Estado: 'Faltante' }));

    const resultadoFinal = {
      encontrados,
      faltantes: faltantesMarcados,
      no_registrados,
    };

    setEscaneados(nuevosEscaneados);
    localStorage.setItem(`escaneados_${empresa}`, JSON.stringify(nuevosEscaneados));
    setComparacion(resultadoFinal);
    localStorage.setItem(`comparacion_${empresa}`, JSON.stringify(resultadoFinal));

    
    const fecha = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });

    
    setFechaComparacion(fecha);
    localStorage.setItem(`fechaComparacion_${empresa}`, fecha);

    const reportes = JSON.parse(localStorage.getItem(`reportesComparacion_${empresa}`)) || [];
    reportes.push({ usuario: empresa || 'Desconocido', fecha, ...resultadoFinal });
    localStorage.setItem(`reportesComparacion_${empresa}`, JSON.stringify(reportes));

    const reporte = {
      usuario: username,
      empresa: empresa,
      fecha,
      encontrados: resultadoFinal.encontrados || [],
      faltantes: resultadoFinal.faltantes || [],
      no_registrados: resultadoFinal.no_registrados || []

    };
    Swal.fire('Éxito', 'Reporte enviado al backend correctamente', 'success');

    enviarReporteAlBackend(reporte);

    setIsProcessing(false);

    Swal.fire(
      'Comparación completada',
      `Encontrados: ${encontrados.length}, Faltantes: ${faltantesMarcados.length}, no_registrados: ${no_registrados.length}`,
      'info'
    );
             // Notificar al componente Reportes.jsx para que recargue
             localStorage.setItem("actualizarReportes", Date.now().toString());
     };

      const handleExportar = () => {
      if (!comparacion) {
      Swal.fire('Error', 'No hay resultados para exportar', 'error');
      return;
      }

    setIsProcessing(true);

    const agregarInfoExtra = (item) => ({
      ...item,
      RFID: String(item.RFID || item.codigo || '-'),
      Fecha: fechaComparacion,
      Usuario: empresa || 'Desconocido',
    });

    const dataFinal = [
      ...(Array.isArray(comparacion.encontrados) ? comparacion.encontrados : []),
      ...(Array.isArray(comparacion.faltantes) ? comparacion.faltantes : []),
      ...(Array.isArray(comparacion.no_registrados) ? comparacion.no_registrados : [])
    ];
    


    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataFinal);
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');

    const nombreArchivo = `ComparacionInventario_${empresa}_${fechaComparacion.replace(/[/:, ]/g, '_')}.xlsx`;
    try {
      XLSX.writeFile(wb, nombreArchivo);
      Swal.fire('Éxito', 'Archivo exportado', 'success');
    } catch (error) {
      console.error('Error al exportar:', error);
      Swal.fire('Error', 'No se pudo exportar el archivo', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLimpiarEscaneados = () => {
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'Estas seguro que quieres borrar la lista de Artículos Escaneados?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed) {
        codigosSet.current.clear();
        setEscaneados([]);
        localStorage.removeItem(`escaneados_${empresa}`);
        Swal.fire('Limpieza exitosa', 'Se ha borrado la lista de artículos Escaneados.', 'success');
      }
    });
  };

  const copiarAlPortapapeles = (texto) => {
    navigator.clipboard.writeText(texto).then(() => {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Copiado al portapapeles',
        showConfirmButton: false,
        timer: 1000,
      });
    });
  };

const activarEscaneoEtiqueta = () => {
  navigate('/escanador-barras'); // Asegúrate que esta ruta exista
};


  return (
    <div className="control-container">
      <RFIDListener onEtiquetaLeida={onEtiquetaLeida} />
      <div className="control-header">
        <div className="left-actions">
          <button className="btn-regresar" onClick={handleBack}>Regresar</button>
        </div>
        <div className="user-info">
          <span className="user-icon">👤</span>
          <span className="username">{empresa}</span>

          <button className="btn-logout" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </div>

      <h2>Control de Inventario</h2>

      <div className="control-buttons">
     
        <button onClick={handleComparar} disabled={isProcessing}>
          {isProcessing ? 'Procesando...' : 'Comparar'}
        </button>

        <button onClick={handleExportar} disabled={isProcessing}>
          {isProcessing ? 'Exportando...' : 'Exportar Resultados'}
        </button>

        <button onClick={() => {
          setMostrarImportados(true);
          setComparacion(null);
        }}>
          Artículos Escaneados
        </button>

        <button onClick={handleLimpiarEscaneados} disabled={isProcessing}>
          Limpiar Escaneados
        </button>

        <button onClick={activarEscaneoEtiqueta}>Escanear Etiqueta</button>

      </div>

      {comparacion && (
        <div className="tabla-contenedor">
          <h3>Resultados de la Comparación</h3>
          <table className="tabla-comparacion">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>SKU</th>
                <th>Marca</th>
                <th>RFID</th>
                <th>Ubicación</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
            {[
  ...(Array.isArray(comparacion.encontrados) ? comparacion.encontrados : []),
  ...(Array.isArray(comparacion.faltantes) ? comparacion.faltantes : []),
  ...(Array.isArray(comparacion.no_registrados) ? comparacion.no_registrados : [])
].map((item, index) => (

                <tr key={index}>
                  <td>{item.Nombre || '-'}</td>
                  <td>{item.Codigo || '-'}</td>
                  <td>{item.SKU || '-'}</td>
                  <td>{item.Marca || '-'}</td>
                  <td className="celda-RFID">
                  <button onClick={() => copiarAlPortapapeles(String(item.RFID || item.Codigo || '-'))}
                   style={{ background: 'none', border: 'none', padding: 0, color: 'blue', textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-word', whiteSpace: 'normal' }}
                  >
                   {String(item.RFID || item.Codigo || '-')}
                  </button>
                  </td>
                  <td>{item.Ubicacion || '-'}</td>
                  <td>{item.Estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

{mostrarImportados && (
  <div className="tabla-contenedor">
    <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', margin: '20px 0' }}>
      <button
        className="btn"
        style={{
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '8px',
          fontWeight: 'bold'
        }}
        onClick={() => {
          setEscaneoActivo(true);
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'WebSocket conectado',
            showConfirmButton: false,
            timer: 1200
          });
        }}
      >
        Escanear
      </button>

      <button
        className="btn"
        style={{
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '8px',
          fontWeight: 'bold'
        }}
        onClick={() => {
          setEscaneoActivo(false);
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'WebSocket desconectado',
            showConfirmButton: false,
            timer: 1200
          });
        }}
      >
        Terminar
      </button>
    </div>

    <h3>Artículos Escaneados</h3>

          <table className="tabla-comparacion">
                <thead>
                <tr>
                <th>N.º</th>
                <th>Código RFID</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {escaneados.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>
                  <button onClick={() => copiarAlPortapapeles(String(item.codigo))}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'blue', textDecoration: 'underline', cursor: 'pointer' }}
                 >
                  {String(item.codigo)}
                   </button>


                  </td>
                  <td>{item.Estado || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
      )}
    </div>
  );
}

export default ControlInventario;
