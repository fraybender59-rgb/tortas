const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

const app = express();

// 👉 CORRECCIÓN 1: Aumentar el límite de tamaño para permitir subir fotos en Base64 sin dar Error 500.
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 👉 CORRECCIÓN 2: Inicialización segura de Firebase.
let serviceAccount;
try {
    // ASEGÚRATE de que el nombre de abajo coincida con el archivo JSON que descargaste de Firebase.
    serviceAccount = require('./firebase-key.json'); 
    
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase conectado correctamente");
    }
} catch (err) {
    console.error("❌ ERROR FATAL: No se pudo inicializar Firebase. Revisa que el archivo 'firebase-key.json' exista.", err.message);
}

const db = admin.apps.length ? admin.firestore() : null;

// Servir archivos HTML estáticos (administracion.html, clientes.html, etc.)
app.use(express.static(path.join(__dirname)));

// ==========================================
// RUTAS DE INVENTARIO
// ==========================================
app.get('/api/inventario', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const snapshot = await db.collection('inventario').get();
        const inventario = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(inventario);
    } catch (error) {
        console.error("Error al obtener inventario:", error);
        res.status(500).json({ error: "Error interno al leer inventario" });
    }
});

app.post('/api/inventario', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const { nombre, cantidad } = req.body;
        const docRef = await db.collection('inventario').add({ nombre, cantidad: cantidad || 0, bloqueado: false, horaBloqueo: null });
        res.status(201).json({ success: true, id: docRef.id });
    } catch (error) {
        console.error("Error al crear producto:", error);
        res.status(500).json({ error: "Error interno al crear producto" });
    }
});

app.post('/api/inventario/modificar', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const { nombre, cantidad, operacion } = req.body;
        const snapshot = await db.collection('inventario').where('nombre', '==', nombre).limit(1).get();
        
        if (snapshot.empty) return res.status(404).json({ error: "Producto no encontrado" });

        const doc = snapshot.docs[0];
        const data = doc.data();
        let nuevoStock = data.cantidad || 0;

        if (operacion === 'sumar') nuevoStock += parseInt(cantidad);
        if (operacion === 'restar') nuevoStock -= parseInt(cantidad);

        await doc.ref.update({ cantidad: nuevoStock });
        res.status(200).json({ success: true, nuevoStock });
    } catch (error) {
        console.error("Error al modificar stock:", error);
        res.status(500).json({ error: "Error interno al modificar stock" });
    }
});

app.post('/api/inventario/bloquear', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const { nombre, bloqueado, horaBloqueo } = req.body;
        const snapshot = await db.collection('inventario').where('nombre', '==', nombre).limit(1).get();
        
        if (snapshot.empty) return res.status(404).json({ error: "Producto no encontrado" });

        await snapshot.docs[0].ref.update({ bloqueado, horaBloqueo });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error al bloquear producto:", error);
        res.status(500).json({ error: "Error interno al bloquear" });
    }
});

// ==========================================
// RUTAS DE PEDIDOS Y CUENTAS
// ==========================================
app.get('/api/pedidos', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const snapshot = await db.collection('pedidos').orderBy('fecha', 'desc').limit(100).get();
        const pedidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(pedidos);
    } catch (error) {
        console.error("Error al obtener pedidos:", error);
        res.status(500).json({ error: "Error al cargar pedidos" });
    }
});

app.post('/api/pedidos', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const pedidoData = req.body;
        pedidoData.fecha = new Date().toISOString();
        
        const docRef = await db.collection('pedidos').add(pedidoData);
        res.status(201).json({ success: true, id: docRef.id });
    } catch (error) {
        console.error("Error al guardar pedido:", error);
        res.status(500).json({ error: "Error interno al guardar el pedido" });
    }
});

app.put('/api/pedidos/:id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const { id } = req.params;
        const updates = req.body;
        await db.collection('pedidos').doc(id).update(updates);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error al actualizar pedido:", error);
        res.status(500).json({ error: "Error al actualizar" });
    }
});

app.get('/api/cuentas', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const snapshot = await db.collection('pedidos').get();
        const cuentas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(cuentas);
    } catch (error) {
        console.error("Error al obtener cuentas:", error);
        res.status(500).json({ error: "Error al cargar cuentas" });
    }
});

app.put('/api/cuentas/:id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const { id } = req.params;
        await db.collection('pedidos').doc(id).update(req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error al modificar cuenta:", error);
        res.status(500).json({ error: "Error al modificar" });
    }
});

app.delete('/api/cuentas/:id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const { id } = req.params;
        await db.collection('pedidos').doc(id).delete();
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error al eliminar cuenta:", error);
        res.status(500).json({ error: "Error al eliminar" });
    }
});

// ==========================================
// RUTA PARA OBTENER COMPROBANTE
// ==========================================
app.get('/api/comprobantes/:id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Base de datos no conectada" });
    try {
        const doc = await db.collection('pedidos').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "No encontrado" });
        
        const data = doc.data();
        res.status(200).json({ imagen: data.comprobanteAdjunto || null });
    } catch (error) {
        console.error("Error al obtener comprobante:", error);
        res.status(500).json({ error: "Error al cargar imagen" });
    }
});

// ==========================================
// CONFIGURACIÓN DE TARJETA
// ==========================================
app.get('/api/config/tarjeta', async (req, res) => {
    res.status(200).json({ numero: "1234 5678 9012 3456" });
});

// ==========================================
// MANEJO DE RUTAS NO ENCONTRADAS Y ERRORES GLOBALES
// ==========================================
app.use((req, res, next) => {
    res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((err, req, res, next) => {
    console.error("💥 ERROR NO MANEJADO:", err);
    res.status(500).json({ error: "Error interno del servidor" });
});

// 👉 CONFIGURACIÓN DEL PUERTO (Evita el error 504)
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});
