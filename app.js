const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 👇 AQUÍ ES DONDE DEBES COMPLETAR TU MENÚ GIGANTE 👇
const menuBase = {
  "Sencillas": [
    {"nombre": "Torta de Milanesa", "precio": 75}, 
    {"nombre": "Torta de Pierna", "precio": 75},
    // AÑADE EL RESTO DE TUS TORTAS SENCILLAS AQUÍ
  ],
  "Combinadas": [
    {"nombre": "Trailera", "precio": 80}, 
    {"nombre": "Toluqueña", "precio": 80},
    // AÑADE EL RESTO DE TUS TORTAS COMBINADAS AQUÍ
  ],
  "Bebidas": [
    {"nombre": "Coca Cola", "precio": 25}, 
    {"nombre": "Agua Embotellada (Simple)", "precio": 20}
    // AÑADE EL RESTO DE TUS BEBIDAS AQUÍ
  ]
};

// 👇 AQUÍ TAMBIÉN DEBES PONER EL NOMBRE DE TODAS TUS TORTAS PARA EL INVENTARIO 👇
const invBase = { 
  "Torta de Milanesa": 20, 
  "Torta de Pierna": 20, 
  "Trailera": 20, 
  "Toluqueña": 20, 
  "Coca Cola": 20, 
  "Agua Embotellada (Simple)": 20 
  // AÑADE EL RESTO DE NOMBRES AQUÍ CON SU STOCK INICIAL
};


app.get('/api/menu', async (req, res) => {
  try {
    // Usamos 'menu_oficial' para forzar a Firebase a tomar tu nueva lista
    const doc = await db.collection('config').doc('menu_oficial').get();
    if (!doc.exists) {
      await db.collection('config').doc('menu_oficial').set(menuBase);
      return res.json(menuBase);
    }
    res.json(doc.data());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pedidos', async (req, res) => {
  try {
    const snapshot = await db.collection('pedidos').get();
    const pedidos = [];
    snapshot.forEach(doc => pedidos.push({ id: doc.id, ...doc.data() }));
    res.json(pedidos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pedidos', async (req, res) => {
  try {
    const nuevoPedido = { ...req.body, fecha: new Date().toISOString() };
    const docRef = await db.collection('pedidos').add(nuevoPedido);
    res.json({ success: true, id: docRef.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cambios = req.body;
    await db.collection('pedidos').doc(id).update(cambios);

    if (cambios.estado === 'Cobrado') {
      const pedidoDoc = await db.collection('pedidos').doc(id).get();
      const pedido = pedidoDoc.data();
      if (pedido && pedido.items) {
        const invRef = db.collection('config').doc('inventario_oficial');
        const invDoc = await invRef.get();
        let inventario = invDoc.exists ? invDoc.data() : {};
        pedido.items.forEach(item => {
          if (inventario[item.nombre] !== undefined) {
            inventario[item.nombre] -= item.cantidad;
          }
        });
        await invRef.set(inventario, { merge: true });
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventario', async (req, res) => {
  try {
    const doc = await db.collection('config').doc('inventario_oficial').get();
    if (!doc.exists) {
      await db.collection('config').doc('inventario_oficial').set(invBase);
      return res.json(invBase);
    }
    res.json(doc.data());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
