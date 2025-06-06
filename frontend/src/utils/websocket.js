let socket = null;

export const getSocket = () => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    socket = new WebSocket('wss://RFID-websocket-server-production.up.railway.app');

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // ✅ Si el mensaje es de tipo inventario, guárdalo en localStorage
        if (data.tipo === 'inventario' && Array.isArray(data.inventario)) {
          const empresa = data.empresa || 'empresa_default';

          const normalizado = data.inventario.map(item => ({
            Nombre: item.Nombre,
            Codigo: item.Codigo,
            SKU: item.SKU,
            Marca: item.Marca,
            RFID: String(item.RFID),
            Ubicacion: item.Ubicacion,
            Estado: item.Estado || 'Faltante',
          }));

          localStorage.setItem(`inventarioBase_${empresa}`, JSON.stringify(normalizado));

          // ✅ Refrescar página si estamos en /inventario
          if (window.location.pathname.includes('/inventario')) {
            window.location.reload();
          }

          console.log('✅ Inventario actualizado por WebSocket desde Android');
        }

      } catch (error) {
        console.error('[WebSocket] Error al procesar mensaje:', error);
      }
    };
  }
  return socket;
};
