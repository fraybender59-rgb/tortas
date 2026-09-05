const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Permitir imágenes en base64

// ==========================================
// INICIALIZACIÓN DE FIREBASE
// ==========================================
if (!admin.apps.length) {
  // Validar variables de entorno esenciales
  const requiredEnv = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_DATABASE_URL'];
  const missing = requiredEnv.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();
const inventarioRef = db.ref('inventario');
const cuentasRef = db.ref('cuentas');

// ==========================================
// RUTAS DE INVENTARIO (existentes)
// ==========================================

// GET: Obtener todo el inventario
app.get('/api/inventario', async (req, res) => {
  try {
    const snapshot = await inventarioRef.once('value');
    const data = snapshot.val();
    const inventarioArray = data ? Object.values(data) : [];
    res.status(200).json(inventarioArray);
  } catch (error) {
    console.error("Error al obtener inventario:", error);
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

// POST: Crear nuevo producto o inicializarlo
app.post('/api/inventario', async (req, res) => {
  try {
    const { nombre, cantidad } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    
    const idNombre = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const productoRef = inventarioRef.child(idNombre);
    
    const snapshot = await productoRef.once('value');
    if (!snapshot.exists()) {
      await productoRef.set({
        nombre: nombre,
        cantidad: cantidad || 0,
        bloqueado: false,
        horaBloqueo: null
      });
    }
    res.status(200).json({ success: true, mensaje: 'Producto registrado' });
  } catch (error) {
    console.error("Error al crear producto:", error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST: Sumar o restar stock
app.post('/api/inventario/modificar', async (req, res) => {
  try {
    const { nombre, cantidad, operacion } = req.body;
    const idNombre = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const productoRef = inventarioRef.child(idNombre);
    
    const snapshot = await productoRef.once('value');
    if (snapshot.exists()) {
      let stockActual = snapshot.val().cantidad || 0;
      let nuevoStock = operacion === 'sumar' ? stockActual + cantidad : stockActual - cantidad;
      if (nuevoStock < 0) nuevoStock = 0;
      
      await productoRef.update({ cantidad: nuevoStock });
      res.status(200).json({ success: true, mensaje: 'Stock actualizado' });
    } else {
      res.status(404).json({ error: 'Producto no encontrado' });
    }
  } catch (error) {
    console.error("Error al modificar stock:", error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST: Bloquear producto o asignar temporizador
app.post('/api/inventario/bloquear', async (req, res) => {
  try {
    const { nombre, bloqueado, horaBloqueo } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }

    const idNombre = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const productoRef = inventarioRef.child(idNombre);
    
    const snapshot = await productoRef.once('value');
    if (snapshot.exists()) {
      await productoRef.update({
        bloqueado: bloqueado !== undefined ? bloqueado : false,
        horaBloqueo: horaBloqueo || null
      });
      res.status(200).json({ success: true, mensaje: 'Estado de bloqueo actualizado' });
    } else {
      res.status(404).json({ error: 'Producto no encontrado' });
    }
  } catch (error) {
    console.error('Error al actualizar estado de bloqueo:', error);
    res.status(500).json({ error: 'Error interno al bloquear producto' });
  }
});

// ==========================================
// RUTAS DE CUENTAS (existentes + nuevas)
// ==========================================

// GET: Obtener todas las cuentas activas
app.get('/api/cuentas', async (req, res) => {
  try {
    const snapshot = await cuentasRef.once('value');
    const data = snapshot.val();
    res.status(200).json(data ? Object.values(data) : []);
  } catch (error) {
    console.error("Error al obtener cuentas:", error);
    res.status(500).json({ error: 'Error al obtener cuentas' });
  }
});

// PUT: Actualizar una cuenta (total, notaAdmin, etc.)
app.put('/api/cuentas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { total, notaAdmin, metodo, estado } = req.body;

    if (!id) return res.status(400).json({ error: 'ID de cuenta requerido' });

    const cuentaRef = cuentasRef.child(id);
    const snapshot = await cuentaRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    const updates = {};
    if (total !== undefined) updates.total = parseFloat(total);
    if (notaAdmin !== undefined) updates.notaAdmin = notaAdmin;
    if (metodo !== undefined) updates.metodoPago = metodo;
    if (estado !== undefined) updates.estado = estado;

    await cuentaRef.update(updates);
    res.status(200).json({ success: true, mensaje: 'Cuenta actualizada' });
  } catch (error) {
    console.error("Error al actualizar cuenta:", error);
    res.status(500).json({ error: 'Error interno al actualizar la cuenta' });
  }
});

// DELETE: Eliminar una cuenta (cuando se cobra o cancela)
app.delete('/api/cuentas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await cuentasRef.child(id).remove();
    res.status(200).json({ success: true, mensaje: 'Cuenta eliminada correctamente' });
  } catch (error) {
    console.error("Error al eliminar cuenta:", error);
    res.status(500).json({ error: 'Error interno al borrar la cuenta' });
  }
});

// ==========================================
// NUEVA RUTA: Crear un pedido (desde clientes o comandero)
// ==========================================
app.post('/api/pedidos', async (req, res) => {
  try {
    const { cliente, items, total, estado, metodoPagoInicial, comprobanteAdjunto, origen } = req.body;

    // Validaciones básicas
    if (!cliente || !items || items.length === 0) {
      return res.status(400).json({ error: 'Faltan datos del pedido (cliente y items son obligatorios)' });
    }

    // Calcular total si no viene (por seguridad)
    let totalCalculado = total;
    if (totalCalculado === undefined) {
      totalCalculado = items.reduce((sum, item) => sum + (item.precio * (item.cantidad || 1)), 0);
    }

    // Crear objeto de cuenta con todos los campos necesarios
    const nuevoPedido = {
      cliente: cliente,
      items: items.map(item => ({
        nombre: item.nombre,
        cantidad: item.cantidad || 1,
        precio: item.precio,
        subtotal: (item.precio * (item.cantidad || 1))
      })),
      total: parseFloat(totalCalculado),
      estado: estado || 'Pendiente',
      fecha: new Date().toISOString(),
      origen: origen || 'cliente',
      metodoPagoInicial: metodoPagoInicial || 'Efectivo',
      tieneFoto: !!comprobanteAdjunto,
      comprobante: comprobanteAdjunto || null, // Guardamos la imagen en base64 (puede ser pesado)
      notaAdmin: '',
      // Campos adicionales para la administración
      cobrado: false,
      pagadoCon: null
    };

    // Guardar en Firebase bajo la referencia 'cuentas'
    const nuevaRef = cuentasRef.push();
    await nuevaRef.set(nuevoPedido);

    res.status(201).json({ 
      success: true, 
      id: nuevaRef.key, 
      mensaje: 'Pedido creado exitosamente' 
    });
  } catch (error) {
    console.error("Error al crear pedido:", error);
    res.status(500).json({ error: 'Error interno al guardar el pedido' });
  }
});

// ==========================================
// RUTA PARA OBTENER COMPROBANTE (imagen) de un pedido
// ==========================================
app.get('/api/comprobantes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const cuentaRef = cuentasRef.child(id);
    const snapshot = await cuentaRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const data = snapshot.val();
    if (data.comprobante) {
      res.status(200).json({ imagen: data.comprobante });
    } else {
      res.status(404).json({ error: 'No hay comprobante para este pedido' });
    }
  } catch (error) {
    console.error("Error al obtener comprobante:", error);
    res.status(500).json({ error: 'Error al obtener el comprobante' });
  }
});

// ==========================================
// RUTA PARA CONFIGURACIÓN DE TARJETA (número de transferencia)
// ==========================================
app.get('/api/config/tarjeta', (req, res) => {
  // Puedes cambiar este número por el que desees o leerlo de una variable de entorno
  const numero = process.env.NUMERO_TARJETA || '1234 5678 9012 3456';
  res.status(200).json({ numero });
});

// ==========================================
// MANEJO DE RUTAS NO ENCONTRADAS
// ==========================================
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ==========================================
// MANEJADOR DE ERRORES GLOBAL
// ==========================================
app.use((err, req, res, next) => {
  console.error('Error no capturado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ==========================================
// EXPORTAR PARA VERCELL O ESCUCHAR LOCAL
// ==========================================
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor local corriendo en puerto ${PORT}`);
  });
}
module.exports = app;
