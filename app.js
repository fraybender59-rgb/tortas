const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Inicialización de Firebase
if (!admin.apps.length) {
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
const cuentasRef = db.ref('cuentas'); // Referencia añadida para las cuentas

// ==========================================
// RUTAS DE INVENTARIO
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
    res.status(500).send('Error al obtener inventario');
  }
});

// POST: Crear nuevo producto o inicializarlo
app.post('/api/inventario', async (req, res) => {
  try {
    const { nombre, cantidad } = req.body;
    if (!nombre) return res.status(400).send('Nombre requerido');
    
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
    res.status(200).send('Producto registrado');
  } catch (error) {
    console.error("Error al crear producto:", error);
    res.status(500).send('Error interno');
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
      res.status(200).send('Stock actualizado');
    } else {
      res.status(404).send('Producto no encontrado');
    }
  } catch (error) {
    console.error("Error al modificar stock:", error);
    res.status(500).send('Error interno');
  }
});

// NUEVA RUTA POST: Bloquear producto o asignar temporizador
app.post('/api/inventario/bloquear', async (req, res) => {
  try {
    const { nombre, bloqueado, horaBloqueo } = req.body;
    
    if (!nombre) {
      return res.status(400).send('El nombre del producto es requerido');
    }

    const idNombre = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const productoRef = inventarioRef.child(idNombre);
    
    const snapshot = await productoRef.once('value');
    if (snapshot.exists()) {
      await productoRef.update({
        bloqueado: bloqueado !== undefined ? bloqueado : false,
        horaBloqueo: horaBloqueo || null
      });
      res.status(200).send({ mensaje: 'Estado de bloqueo actualizado exitosamente' });
    } else {
      res.status(404).send('Producto no encontrado en la base de datos');
    }
  } catch (error) {
    console.error('Error al actualizar estado de bloqueo:', error);
    res.status(500).send('Error interno del servidor al bloquear producto');
  }
});

// ==========================================
// RUTAS DE CUENTAS
// ==========================================

// GET: Obtener todas las cuentas activas
app.get('/api/cuentas', async (req, res) => {
  try {
    const snapshot = await cuentasRef.once('value');
    const data = snapshot.val();
    res.status(200).json(data ? Object.values(data) : []);
  } catch (error) {
    console.error("Error al obtener cuentas:", error);
    res.status(500).send('Error al obtener cuentas');
  }
});

// DELETE: Eliminar una cuenta cuando se marca como pagada
app.delete('/api/cuentas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await cuentasRef.child(id).remove();
    res.status(200).send('Cuenta eliminada correctamente');
  } catch (error) {
    console.error("Error al eliminar cuenta:", error);
    res.status(500).send('Error interno al borrar la cuenta');
  }
});

// Exportar para Vercel o escuchar puerto en entorno local
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor local corriendo en puerto ${PORT}`);
  });
}
module.exports = app;
