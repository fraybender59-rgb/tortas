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
    } catch (e) { admin.initializeApp(); }
  }
}

const db = admin.firestore();
let pedidosCache = [];
let cacheInicializado = false;

async function inicializarCache() {
  if (cacheInicializado) return;
  const snapshot = await db.collection('pedidos').get();
  pedidosCache = [];
  snapshot.forEach(doc => pedidosCache.push({ id: doc.id, ...doc.data() }));
  pedidosCache.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  cacheInicializado = true;
}

// NUEVO: SISTEMA DE DESCUENTO IGNORANDO MAYÚSCULAS/MINÚSCULAS CON 1 SOLA LECTURA
async function descontarInventario(items) {
  if (!items || !Array.isArray(items)) return;
  try {
    const invSnapshot = await db.collection('inventario_la_queen').get();
    const batch = db.batch();
    let updated = false;

    items.forEach(item => {
      const itemName = (item.nombre || "").trim().toLowerCase();
      const cantDesc = parseInt(item.cantidad) || 1;
      
      const doc = invSnapshot.docs.find(d => (d.data().nombre || "").trim().toLowerCase() === itemName);
      if (doc) {
        const actual = parseInt(doc.data().cantidad) || 0;
        const nuevaCantidad = Math.max(0, actual - cantDesc);
        batch.update(doc.ref, { cantidad: nuevaCantidad });
        updated = true;
      }
    });

    if (updated) await batch.commit();
  } catch (err) { console.error("Error al descontar inventario:", err.message); }
}

app.get('/api/pedidos', async (req, res) => {
  try {
    if (!cacheInicializado) await inicializarCache();
    res.json(pedidosCache);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pedidos', async (req, res) => {
  try {
    const { comprobanteAdjunto, imagen, comprobante, ...datosPedido } = req.body;
    // Atrapamos la imagen sin importar cómo la envíe clientes.html
    const fotoFinal = comprobanteAdjunto || imagen || comprobante; 
    const fechaActual = new Date().toISOString();

    const nuevoPedido = {
      ...datosPedido,
      fecha: datosPedido.fecha || fechaActual,
      estado: datosPedido.estado || 'Pendiente',
      tieneFoto: Boolean(fotoFinal)
    };

    const docRef = await db.collection('pedidos').add(nuevoPedido);
    const pedidoCompleto = { id: docRef.id, ...nuevoPedido };

    if (cacheInicializado) pedidosCache.unshift(pedidoCompleto);

    if (nuevoPedido.items && nuevoPedido.items.length > 0) {
      descontarInventario(nuevoPedido.items);
    }

    if (fotoFinal) {
      await db.collection('comprobantes').add({
        pedidoId: docRef.id,
        fecha: fechaActual.split('T')[0],
        imagen: fotoFinal
      });
    }

    res.json({ success: true, id: docRef.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pedidos/:id', async (req, res) => {
  try {
    await db.collection('pedidos').doc(req.params.id).update(req.body);
    if (cacheInicializado) {
      const index = pedidosCache.findIndex(p => p.id === req.params.id);
      if (index !== -1) pedidosCache[index] = { ...pedidosCache[index], ...req.body };
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NUEVO ENDPOINT: PARA LA GALERÍA DE COMPROBANTES
app.get('/api/comprobantes', async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.json([]);
    const snapshot = await db.collection('comprobantes').where('fecha', '==', fecha).get();
    const fotos = [];
    snapshot.forEach(doc => fotos.push(doc.data().imagen || doc.data().comprobante));
    res.json(fotos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/comprobantes/:pedidoId', async (req, res) => {
  try {
    const snapshot = await db.collection('comprobantes').where('pedidoId', '==', req.params.pedidoId).limit(1).get();
    if (snapshot.empty) return res.status(404).json({ error: 'No foto' });
    res.json({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventario', async (req, res) => {
  try {
    const snapshot = await db.collection('inventario_la_queen').get();
    const inv = [];
    snapshot.forEach(doc => inv.push({ id: doc.id, ...doc.data() }));
    res.json(inv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventario/modificar', async (req, res) => {
  try {
    const { nombre, cantidad, operacion } = req.body;
    const invSnapshot = await db.collection('inventario_la_queen').get();
    const doc = invSnapshot.docs.find(d => (d.data().nombre || "").trim().toLowerCase() === nombre.trim().toLowerCase());
    
    if (doc) {
      const actual = doc.data().cantidad || 0;
      let nueva = operacion === 'sumar' ? actual + cantidad : Math.max(0, actual - cantidad);
      await doc.ref.update({ cantidad: nueva });
      res.json({ success: true, nuevaCantidad: nueva });
    } else {
      res.status(404).json({ error: 'No encontrado' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, async () => { await inicializarCache(); });
}
module.exports = app;
