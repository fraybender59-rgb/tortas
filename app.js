const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' })); 
app.use(express.static(__dirname));

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    try {
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (e) {
      admin.initializeApp();
    }
  }
}

const db = admin.firestore();

// --- INICIO DE SISTEMA DE CACHÉ EN MEMORIA ---
let pedidosCache = [];
let cacheInicializado = false;

async function inicializarCache() {
  if (cacheInicializado) return;
  try {
    const snapshot = await db.collection('pedidos').get();
    pedidosCache = [];
    snapshot.forEach(doc => pedidosCache.push({ id: doc.id, ...doc.data() }));
    // Ordenar del más reciente al más antiguo
    pedidosCache.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    cacheInicializado = true;
    console.log("✅ Caché de pedidos inicializado en memoria RAM. Lecturas a Firebase minimizadas.");
  } catch (e) {
    console.error("Error al inicializar caché:", e.message);
  }
}
// --- FIN DE SISTEMA DE CACHÉ ---

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

async function limpiarComprobantesAntiguos() {
  try {
    const limiteDias = 30;
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

app.get('/api/pedidos', async (req, res) => {
  try {
    if (!cacheInicializado) {
      await inicializarCache(); // Lee de Firebase solo la primera vez o si se reinicia el servidor
    }
    res.json(pedidosCache); // Devuelve instantáneamente los datos desde la memoria RAM local
  } catch (e) {
    console.error("Error al obtener pedidos:", e.message);
    res.status(500).json({ error: e.message });
  }
});

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

    // Escritura única en Firebase
    const docRef = await db.collection('pedidos').add(nuevoPedido);
    const pedidoCompleto = { id: docRef.id, ...nuevoPedido };

    // Inserción en memoria RAM al inicio del arreglo
    if (cacheInicializado) {
      pedidosCache.unshift(pedidoCompleto);
    }

    if (nuevoPedido.items && nuevoPedido.items.length > 0) {
      descontarInventario(nuevoPedido.items).catch(err =>
        console.error("Error en proceso de inventario:", err.message)
      );
    }

    if (comprobanteAdjunto) {
      await db.collection('comprobantes').add({
        pedidoId: docRef.id,
        fecha: fechaActual.split('T')[0],
        imagen: comprobanteAdjunto,
        creadoEn: fechaActual
      }).catch(err => console.error("Error al guardar comprobante:", err.message));
    }

    limpiarComprobantesAntiguos().catch(err => console.error(err));

    res.json({ success: true, id: docRef.id });
  } catch (e) {
    console.error('Error al crear pedido:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const actualizacion = req.body;

    // Actualiza en Firebase
    await db.collection('pedidos').doc(id).update(actualizacion);

    // Actualiza el estado en la memoria RAM instantáneamente 
    if (cacheInicializado) {
      const index = pedidosCache.findIndex(p => p.id === id);
      if (index !== -1) {
        pedidosCache[index] = { ...pedidosCache[index], ...actualizacion };
      }
    }

    res.json({ success: true, id });
  } catch (e) {
    console.error(`Error al actualizar pedido ${req.params.id}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Elimina de Firebase
    await db.collection('pedidos').doc(id).delete();

    // Elimina el pedido del arreglo en la memoria RAM
    if (cacheInicializado) {
      pedidosCache = pedidosCache.filter(p => p.id !== id);
    }

    res.json({ success: true, id });
  } catch (e) {
    console.error(`Error al eliminar pedido ${req.params.id}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

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

app.post('/api/inventario/modificar', async (req, res) => {
  try {
    const { nombre, cantidad, operacion } = req.body;
    const snapshot = await db.collection('inventario_la_queen')
      .where('nombre', '==', nombre)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const actual = doc.data().cantidad || 0;
      let nueva = actual;
      
      if (operacion === 'sumar') nueva += cantidad;
      if (operacion === 'restar') nueva = Math.max(0, actual - cantidad);
      
      await doc.ref.update({ cantidad: nueva });
      res.json({ success: true, nuevaCantidad: nueva });
    } else {
      if (operacion === 'sumar') {
         await db.collection('inventario_la_queen').add({ nombre, cantidad });
         res.json({ success: true });
      } else {
         res.status(404).json({ error: 'Producto no encontrado' });
      }
    }
  } catch (e) {
    console.error("Error al modificar inventario:", e.message);
    res.status(500).json({ error: e.message });
  }
});

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

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
    await inicializarCache(); // Carga la memoria al arrancar la consola
  });
}

module.exports = app;

