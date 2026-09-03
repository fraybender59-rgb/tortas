const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Soporte para imágenes base64 de comprobantes
app.use(express.static(__dirname));

// Inicialización de Firebase Admin SDK
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    try {
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (e) {
      admin.initializeApp();
    }
  }
}

const db = admin.firestore();

// ===================== DESCUENTO DE INVENTARIO SEGURO =====================
async function descontarInventario(items) {
  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    try {
      const snapshot = await db.collection('inventario_la_queen')
        .where('nombre', '==', item.nombre)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const actual = doc.data().cantidad || 0;
        const nuevaCantidad = Math.max(0, actual - (item.cantidad || 1));
        await doc.ref.update({ cantidad: nuevaCantidad });
      }
    } catch (err) {
      console.error(`⚠️ Error al descontar inventario para ${item.nombre}:`, err.message);
    }
  }
}

// ===================== LIMPIEZA AUTOMÁTICA DE COMPROBANTES =====================
async function limpiarComprobantesAntiguos() {
  try {
    const limiteDias = 3;
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - limiteDias);
    const isoLimite = fechaLimite.toISOString().split('T')[0];

    const snapshot = await db.collection('comprobantes')
      .where('fecha', '<', isoLimite)
      .get();

    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  } catch (err) {
    console.error("⚠️ Error en la limpieza de comprobantes:", err.message);
  }
}

// ===================== RUTAS DE PEDIDOS =====================

// Obtener pedidos (OPTIMIZADO: Máximo 100 pedidos para proteger cuota diaria)
app.get('/api/pedidos', async (req, res) => {
  try {
    const snapshot = await db.collection('pedidos')
      .limit(100)
      .get();

    const pedidos = [];
    snapshot.forEach(doc => pedidos.push({ id: doc.id, ...doc.data() }));

    // Ordenar en memoria por fecha descendente
    pedidos.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

    res.json(pedidos);
  } catch (e) {
    console.error("Error al obtener pedidos:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Crear nuevo pedido
app.post('/api/pedidos', async (req, res) => {
  try {
    const { comprobanteAdjunto, ...datosPedido } = req.body;
    const fechaActual = new Date().toISOString();

    const nuevoPedido = {
      ...datosPedido,
      fecha: datosPedido.fecha || fechaActual,
      estado: datosPedido.estado || 'Pendiente',
      tieneFoto: Boolean(comprobanteAdjunto)
    };

    // 1. Guardar el pedido principal
    const docRef = await db.collection('pedidos').add(nuevoPedido);

    // 2. Descontar inventario de forma asíncrona no bloqueante
    if (nuevoPedido.items && nuevoPedido.items.length > 0) {
      descontarInventario(nuevoPedido.items).catch(err =>
        console.error("Error en proceso de inventario:", err.message)
      );
    }

    // 3. Guardar comprobante de pago si fue adjuntado
    if (comprobanteAdjunto) {
      await db.collection('comprobantes').add({
        pedidoId: docRef.id,
        fecha: fechaActual.split('T')[0],
        imagen: comprobanteAdjunto,
        creadoEn: fechaActual
      }).catch(err => console.error("Error al guardar comprobante:", err.message));
    }

    // Ejecutar limpieza periódica
    limpiarComprobantesAntiguos().catch(err => console.error(err));

    res.json({ success: true, id: docRef.id });
  } catch (e) {
    console.error('Error al crear pedido:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Actualizar estado de un pedido (Cobrado, Cancelado, etc.)
app.put('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const actualizacion = req.body;

    await db.collection('pedidos').doc(id).update(actualizacion);
    res.json({ success: true, id });
  } catch (e) {
    console.error(`Error al actualizar pedido ${req.params.id}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Eliminar un pedido
app.delete('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('pedidos').doc(id).delete();
    res.json({ success: true, id });
  } catch (e) {
    console.error(`Error al eliminar pedido ${req.params.id}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===================== RUTAS DE INVENTARIO =====================

// Obtener todo el inventario
app.get('/api/inventario', async (req, res) => {
  try {
    const snapshot = await db.collection('inventario_la_queen').get();
    const inventario = [];
    snapshot.forEach(doc => inventario.push({ id: doc.id, ...doc.data() }));
    res.json(inventario);
  } catch (e) {
    console.error("Error al obtener inventario:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Crear o actualizar producto en el inventario
app.post('/api/inventario', async (req, res) => {
  try {
    const item = req.body;
    if (item.id) {
      const docRef = db.collection('inventario_la_queen').doc(item.id);
      delete item.id;
      await docRef.set(item, { merge: true });
      res.json({ success: true, id: docRef.id });
    } else {
      const docRef = await db.collection('inventario_la_queen').add(item);
      res.json({ success: true, id: docRef.id });
    }
  } catch (e) {
    console.error("Error al guardar inventario:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===================== RUTAS DE COMPROBANTES =====================

// Obtener comprobante por ID del pedido
app.get('/api/comprobantes/:pedidoId', async (req, res) => {
  try {
    const { pedidoId } = req.params;
    const snapshot = await db.collection('comprobantes')
      .where('pedidoId', '==', pedidoId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    const doc = snapshot.docs[0];
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    console.error("Error al obtener comprobante:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Arrancar servidor local o exportar para despliegue
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
  });
}

module.exports = app;

