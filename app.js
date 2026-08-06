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

// 👇 AQUÍ ESTÁ TU MENÚ COMPLETO BASADO EN TUS IMÁGENES 👇
const menuBase = {
  "Sencillas": [
    {"nombre": "Milanesa", "precio": 75},
    {"nombre": "Pierna", "precio": 75},
    {"nombre": "Salchicha", "precio": 75},
    {"nombre": "Jamón", "precio": 75},
    {"nombre": "Huevo", "precio": 75},
    {"nombre": "Chuleta", "precio": 75},
    {"nombre": "Q. Puerco", "precio": 75}
  ],
  "Clásicas": [
    {"nombre": "Verónica", "precio": 80},
    {"nombre": "Tatiana", "precio": 80},
    {"nombre": "Mexiquense", "precio": 80},
    {"nombre": "Alemana", "precio": 80},
    {"nombre": "Texana", "precio": 80},
    {"nombre": "Pachuqueña", "precio": 80},
    {"nombre": "Española", "precio": 80},
    {"nombre": "Argentina", "precio": 80},
    {"nombre": "Tabasqueña", "precio": 80},
    {"nombre": "Jarocha", "precio": 80},
    {"nombre": "Veracruzana", "precio": 80}
  ],
  "Combinadas": [
    {"nombre": "Trailera", "precio": 80},
    {"nombre": "Toluqueña", "precio": 80},
    {"nombre": "Italiana", "precio": 80},
    {"nombre": "Suiza", "precio": 80},
    {"nombre": "Michoacana", "precio": 80},
    {"nombre": "Poblana", "precio": 80},
    {"nombre": "Lambada", "precio": 80},
    {"nombre": "Holandesa", "precio": 80},
    {"nombre": "Rusa", "precio": 80},
    {"nombre": "Brasileña", "precio": 80},
    {"nombre": "Francesa", "precio": 80},
    {"nombre": "Alejandra", "precio": 80},
    {"nombre": "Hawaiana", "precio": 80},
    {"nombre": "Oaxaqueña", "precio": 80}
  ],
  "Especiales": [
    {"nombre": "Especial", "precio": 85},
    {"nombre": "Diabla", "precio": 85},
    {"nombre": "Manterola", "precio": 85},
    {"nombre": "Pecaminosa", "precio": 85}
  ],
  "El Tamaño Si Importa": [
    {"nombre": "Insaciable", "precio": 90},
    {"nombre": "Vanidosa", "precio": 90},
    {"nombre": "Caprichosa", "precio": 90},
    {"nombre": "Niña Pobre", "precio": 90},
    {"nombre": "Bomba", "precio": 90},
    {"nombre": "Suspiro de Monja", "precio": 90},
    {"nombre": "Cubana", "precio": 135}
  ],
  "Extras y Bebidas": [
    {"nombre": "Ingrediente Extra", "precio": 5},
    {"nombre": "Coca Cola", "precio": 25},
    {"nombre": "Agua Embotellada", "precio": 20}
  ]
};

// 👇 INVENTARIO INICIAL (Arrancamos todo con 50 unidades) 👇
const invBase = { 
  // Sencillas
  "Milanesa": 50, "Pierna": 50, "Salchicha": 50, "Jamón": 50, "Huevo": 50, "Chuleta": 50, "Q. Puerco": 50,
  // Clásicas
  "Verónica": 50, "Tatiana": 50, "Mexiquense": 50, "Alemana": 50, "Texana": 50, "Pachuqueña": 50, "Española": 50, "Argentina": 50, "Tabasqueña": 50, "Jarocha": 50, "Veracruzana": 50,
  // Combinadas
  "Trailera": 50, "Toluqueña": 50, "Italiana": 50, "Suiza": 50, "Michoacana": 50, "Poblana": 50, "Lambada": 50, "Holandesa": 50, "Rusa": 50, "Brasileña": 50, "Francesa": 50, "Alejandra": 50, "Hawaiana": 50, "Oaxaqueña": 50,
  // Especiales
  "Especial": 50, "Diabla": 50, "Manterola": 50, "Pecaminosa": 50,
  // Gigantes
  "Insaciable": 50, "Vanidosa": 50, "Caprichosa": 50, "Niña Pobre": 50, "Bomba": 50, "Suspiro de Monja": 50, "Cubana": 50,
  // Extras
  "Ingrediente Extra": 50, "Coca Cola": 50, "Agua Embotellada": 50
};


app.get('/api/menu', async (req, res) => {
  try {
    const doc = await db.collection('config').doc('menu_la_queen').get();
    if (!doc.exists) {
      await db.collection('config').doc('menu_la_queen').set(menuBase);
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

    // Si se cobra, restamos del almacén
    if (cambios.estado === 'Cobrado') {
      const pedidoDoc = await db.collection('pedidos').doc(id).get();
      const pedido = pedidoDoc.data();
      if (pedido && pedido.items) {
        const invRef = db.collection('config').doc('inventario_la_queen');
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
    const doc = await db.collection('config').doc('inventario_la_queen').get();
    if (!doc.exists) {
      await db.collection('config').doc('inventario_la_queen').set(invBase);
      return res.json(invBase);
    }
    res.json(doc.data());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventario/modificar', async (req, res) => {
    try {
        const { nombre, cantidad, operacion } = req.body;
        const invRef = db.collection('config').doc('inventario_la_queen');
        const doc = await invRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Inventario no encontrado' });
        
        let inventario = doc.data();
        let cantNum = parseInt(cantidad);
        
        if (operacion === 'sumar') {
            inventario[nombre] += cantNum;
        } else if (operacion === 'restar') {
            inventario[nombre] -= cantNum;
            if(inventario[nombre] < 0) inventario[nombre] = 0;
        }
        
        await invRef.set(inventario, { merge: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// 🔥 RUTA PARA ACTUALIZAR PRECIOS DEL MENÚ
app.post('/api/menu/precio', async (req, res) => {
  try {
    const { categoria, nombre, nuevoPrecio } = req.body;
    const menuRef = db.collection('config').doc('menu_la_queen');
    const doc = await menuRef.get();
    
    if (!doc.exists) return res.status(404).json({ error: 'Menú no encontrado' });
    
    let menu = doc.data();
    if (menu[categoria]) {
        let producto = menu[categoria].find(p => p.nombre === nombre);
        if (producto) {
            producto.precio = parseFloat(nuevoPrecio); // Actualizamos el valor real en Firebase
        }
    }
    
    await menuRef.set(menu);
    res.json({ success: true });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});
module.exports = app;
