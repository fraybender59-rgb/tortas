const express = require('express');
const admin = require('firebase-admin');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
// Función automática para borrar comprobantes de más de 30 días
async function limpiarComprobantesAntiguos() {
    try {
        const hace30Dias = new Date();
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        const isoLimite = hace30Dias.toISOString(); // Fecha límite en texto

        const snapshot = await db.collection('comprobantes').where('creadoEn', '<', isoLimite).get();
        
        if (snapshot.empty) return; // Si no hay viejos, no hace nada

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`🧹 Limpieza automática: Se borraron ${snapshot.size} comprobantes antiguos.`);
    } catch (e) {
        console.error("Error limpiando comprobantes antiguos:", e.message);
    }
}

// MENÚ BASE
const menuBase = {
  "Sencillas": [
    {"nombre": "Milanesa", "precio": 75, "descripcion": "Un ingrediente a escoger. Complemento: jitomate, aguacate, mayonesa; rajas o chipotle."},
    {"nombre": "Pierna", "precio": 75, "descripcion": "Un ingrediente a escoger. Complemento: jitomate, aguacate, mayonesa; rajas o chipotle."},
    {"nombre": "Salchicha", "precio": 75, "descripcion": "Un ingrediente a escoger. Complemento: jitomate, aguacate, mayonesa; rajas o chipotle."},
    {"nombre": "Jamón", "precio": 75, "descripcion": "Un ingrediente a escoger. Complemento: jitomate, aguacate, mayonesa; rajas o chipotle."},
    {"nombre": "Huevo", "precio": 75, "descripcion": "Un ingrediente a escoger. Complemento: jitomate, aguacate, mayonesa; rajas o chipotle."},
    {"nombre": "Chuleta", "precio": 75, "descripcion": "Un ingrediente a escoger. Complemento: jitomate, aguacate, mayonesa; rajas o chipotle."},
    {"nombre": "Q. Puerco", "precio": 75, "descripcion": "Un ingrediente a escoger. Complemento: jitomate, aguacate, mayonesa; rajas o chipotle."}
  ],
  "Clásicas": [
    {"nombre": "Verónica", "precio": 80, "descripcion": "Milanesa, Salchicha, Q. Oaxaca."},
    {"nombre": "Tatiana", "precio": 80, "descripcion": "Milanesa, Pierna, Q. Oaxaca."},
    {"nombre": "Mexiquense", "precio": 80, "descripcion": "Milanesa, Chorizo, Q. Oaxaca."},
    {"nombre": "Alemana", "precio": 80, "descripcion": "Milanesa, Piña, Q. Oaxaca."},
    {"nombre": "Texana", "precio": 80, "descripcion": "Milanesa, Chuleta, Q. Oaxaca."},
    {"nombre": "Pachuqueña", "precio": 80, "descripcion": "Milanesa, Pierna, Piña."},
    {"nombre": "Española", "precio": 80, "descripcion": "Milanesa, Pierna, Huevo."},
    {"nombre": "Argentina", "precio": 80, "descripcion": "Milanesa, Q. Amarillo, Q. Oaxaca."},
    {"nombre": "Tabasqueña", "precio": 80, "descripcion": "Milanesa, Huevo, Q. Oaxaca."},
    {"nombre": "Jarocha", "precio": 80, "descripcion": "Milanesa, Q. Puerco, Q. Blanco."},
    {"nombre": "Veracruzana", "precio": 80, "descripcion": "Milanesa, Salchicha, Q. Puerco."}
  ],
  "Combinadas": [
    {"nombre": "Trailera", "precio": 80, "descripcion": "Salchicha, Pierna, Q. Oaxaca."},
    {"nombre": "Toluqueña", "precio": 80, "descripcion": "Salchicha, Chorizo, Q. Oaxaca."},
    {"nombre": "Italiana", "precio": 80, "descripcion": "Jamón, Q. Amarillo, Q. Oaxaca."},
    {"nombre": "Suiza", "precio": 80, "descripcion": "Q. Amarillo, Q. Oaxaca, Q. Blanco."},
    {"nombre": "Michoacana", "precio": 80, "descripcion": "Salchicha, Jamón, Q. Oaxaca."},
    {"nombre": "Poblana", "precio": 80, "descripcion": "Salchicha, Huevo, Chorizo."},
    {"nombre": "Lambada", "precio": 80, "descripcion": "Pierna, Huevo, Chorizo."},
    {"nombre": "Holandesa", "precio": 80, "descripcion": "Salchicha, Q. Puerco, Jamón."},
    {"nombre": "Rusa", "precio": 80, "descripcion": "Huevo, Jamón, Q. Oaxaca."},
    {"nombre": "Brasileña", "precio": 80, "descripcion": "Huevo, Salchicha, Q. Oaxaca."},
    {"nombre": "Francesa", "precio": 80, "descripcion": "Pierna, Q. Amarillo, Q. Oaxaca."},
    {"nombre": "Alejandra", "precio": 80, "descripcion": "Pierna, Piña, Q. Oaxaca."},
    {"nombre": "Hawaiana", "precio": 80, "descripcion": "Jamón, Piña, Q. Oaxaca."},
    {"nombre": "Oaxaqueña", "precio": 80, "descripcion": "Pierna, Huevo, Q. Oaxaca."}
  ],
  "Especiales": [
    {"nombre": "Especial", "precio": 85, "descripcion": "Milanesa, Pierna, Piña, Q. Oaxaca."},
    {"nombre": "Diabla", "precio": 85, "descripcion": "Milanesa, Chorizo, Piña, Q. Oaxaca."},
    {"nombre": "Manterola", "precio": 85, "descripcion": "Milanesa, Pierna, Chuleta, Q. Oaxaca."},
    {"nombre": "Pecaminosa", "precio": 85, "descripcion": "Milanesa, Huevo, Salchicha, Q. de Puerco."}
  ],
  "El Tamaño Si Importa": [
    {"nombre": "Insaciable", "precio": 90, "descripcion": "Milanesa, Pierna, Salchicha, Chuleta, Q. Oaxaca."},
    {"nombre": "Vanidosa", "precio": 90, "descripcion": "Milanesa, Pierna, Chorizo, Piña, Q. Oaxaca."},
    {"nombre": "Caprichosa", "precio": 90, "descripcion": "Milanesa, Chorizo, Jamón, Salchicha, Q. Oaxaca."},
    {"nombre": "Niña Pobre", "precio": 90, "descripcion": "Milanesa, Huevo, Chorizo, Chuleta, Q. Oaxaca."},
    {"nombre": "Bomba", "precio": 90, "descripcion": "Milanesa, Huevo, Chorizo, Salchicha, Q. Oaxaca."},
    {"nombre": "Suspiro de Monja", "precio": 90, "descripcion": "Milanesa, Pierna, Chorizo, Huevo, Q. Oaxaca."},
    {"nombre": "Cubana", "precio": 135, "descripcion": "Todos los ingredientes. 1.100kg de sabor."}
  ],
  "Extras y Bebidas": [
    {"nombre": "Ingrediente Extra", "precio": 5, "descripcion": "Añade un toque extra a tu torta."},
    {"nombre": "Coca Cola", "precio": 25, "descripcion": "Refresco bien frío."},
    {"nombre": "Agua Embotellada", "precio": 20, "descripcion": "Botella de agua natural."}
  ]
};

const invBase = { 
  "Milanesa": 50, "Pierna": 50, "Salchicha": 50, "Jamón": 50, "Huevo": 50, "Chuleta": 50, "Q. Puerco": 50,
  "Verónica": 50, "Tatiana": 50, "Mexiquense": 50, "Alemana": 50, "Texana": 50, "Pachuqueña": 50, "Española": 50, "Argentina": 50, "Tabasqueña": 50, "Jarocha": 50, "Veracruzana": 50,
  "Trailera": 50, "Toluqueña": 50, "Italiana": 50, "Suiza": 50, "Michoacana": 50, "Poblana": 50, "Lambada": 50, "Holandesa": 50, "Rusa": 50, "Brasileña": 50, "Francesa": 50, "Alejandra": 50, "Hawaiana": 50, "Oaxaqueña": 50,
  "Especial": 50, "Diabla": 50, "Manterola": 50, "Pecaminosa": 50,
  "Insaciable": 50, "Vanidosa": 50, "Caprichosa": 50, "Niña Pobre": 50, "Bomba": 50, "Suspiro de Monja": 50, "Cubana": 50,
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
    const { comprobanteAdjunto, ...datosPedido } = req.body;
    
    const nuevoPedido = { 
        ...datosPedido, 
        fecha: new Date().toISOString(),
        tieneFoto: comprobanteAdjunto ? true : false 
    };
    
    const docRef = await db.collection('pedidos').add(nuevoPedido);

    if (comprobanteAdjunto) {
        await db.collection('comprobantes').add({
            pedidoId: docRef.id,
            fecha: nuevoPedido.fecha.split('T')[0], 
            imagen: comprobanteAdjunto,
            creadoEn: nuevoPedido.fecha
        });
    }

    // Ejecutamos limpieza automática sin detener el proceso del cliente
    limpiarComprobantesAntiguos();

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
        
        if (operacion === 'sumar') { inventario[nombre] += cantNum; } 
        else if (operacion === 'restar') {
            inventario[nombre] -= cantNum;
            if(inventario[nombre] < 0) inventario[nombre] = 0;
        }
        await invRef.set(inventario, { merge: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/menu/precio', async (req, res) => {
  try {
    const { categoria, nombre, nuevoPrecio } = req.body;
    const menuRef = db.collection('config').doc('menu_la_queen');
    const doc = await menuRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Menú no encontrado' });
    let menu = doc.data();
    if (menu[categoria]) {
        let producto = menu[categoria].find(p => p.nombre === nombre);
        if (producto) producto.precio = parseFloat(nuevoPrecio);
    }
    await menuRef.set(menu);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/tarjeta', async (req, res) => {
  try {
    const doc = await db.collection('config').doc('tarjeta_la_queen').get();
    if (!doc.exists) return res.json({ numero: "1234 5678 9012 3456" });
    res.json(doc.data());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/tarjeta', async (req, res) => {
  try {
    const { numero } = req.body;
    await db.collection('config').doc('tarjeta_la_queen').set({ numero });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/comprobantes', async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta la fecha' });
    const snapshot = await db.collection('comprobantes').where('fecha', '==', fecha).get();
    const fotos = [];
    snapshot.forEach(doc => fotos.push(doc.data().imagen));
    res.json(fotos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
