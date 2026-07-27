const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname))); 

// Determinar el directorio escribible (usar /tmp en Vercel/Producción para evitar error EROFS)
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const storageDir = isVercel ? os.tmpdir() : __dirname;

const pedidosFile = path.join(storageDir, 'pedidos.json');
const inventarioFile = path.join(storageDir, 'inventario.json');
const menuFile = path.join(storageDir, 'menu.json');

// --- BASES DE DATOS INICIALES ---
const menuBase = {
    "Sencillas": [
        { nombre: "Torta de Milanesa", precio: 75 }, { nombre: "Torta de Pierna", precio: 75 },
        { nombre: "Torta de Salchicha", precio: 75 }, { nombre: "Torta de Jamón", precio: 75 },
        { nombre: "Torta de Huevo", precio: 75 }, { nombre: "Torta de Chuleta", precio: 75 }, { nombre: "Torta de Q. Puerco", precio: 75 }
    ],
    "Combinadas": [
        { nombre: "Trailera", precio: 80 }, { nombre: "Toluqueña", precio: 80 }, { nombre: "Italiana", precio: 80 },
        { nombre: "Suiza", precio: 80 }, { nombre: "Michoacana", precio: 80 }, { nombre: "Poblana", precio: 80 },
        { nombre: "Lambada", precio: 80 }, { nombre: "Holandesa", precio: 80 }, { nombre: "Rusa", precio: 80 },
        { nombre: "Brasileña", precio: 80 }, { nombre: "Francesa", precio: 80 }, { nombre: "Alejandra", precio: 80 },
        { nombre: "Hawaiana", precio: 80 }, { nombre: "Oaxaqueña", precio: 80 }
    ],
    "Clásicas": [
        { nombre: "Verónica", precio: 80 }, { nombre: "Tatiana", precio: 80 }, { nombre: "Mexiquense", precio: 80 },
        { nombre: "Alemana", precio: 80 }, { nombre: "Texana", precio: 80 }, { nombre: "Pachuqueña", precio: 80 },
        { nombre: "Española", precio: 80 }, { nombre: "Argentina", precio: 80 }, { nombre: "Tabasqueña", precio: 80 },
        { nombre: "Jarocha", precio: 80 }, { nombre: "Veracruzana", precio: 80 }
    ],
    "Especiales": [
        { nombre: "Especial", precio: 85 }, { nombre: "Diabla", precio: 85 }, { nombre: "Manterola", precio: 85 }, { nombre: "Pecaminosa", precio: 85 }
    ],
    "El Tamaño Importa": [
        { nombre: "Insaciable", precio: 90 }, { nombre: "Vanidosa", precio: 90 }, { nombre: "Caprichosa", precio: 90 },
        { nombre: "Niña Pobre", precio: 90 }, { nombre: "Bomba", precio: 90 }, { nombre: "Suspiro de Monja", precio: 90 }
    ],
    "La Cubana": [ { nombre: "Torta Cubana", precio: 135 } ],
    "Bebidas": [
        { nombre: "Coca Cola", precio: 25 }, { nombre: "Refrescos Varios", precio: 25 },
        { nombre: "Agua Embotellada (Simple)", precio: 20 }, { nombre: "Agua Embotellada (Sabores)", precio: 25 }
    ]
};

const inventarioBase = {};
for (let categoria in menuBase) {
    menuBase[categoria].forEach(item => inventarioBase[item.nombre] = 20);
}

// Inicializador con captura de errores
function inicializarArchivos() {
    try {
        if (!fs.existsSync(pedidosFile)) fs.writeFileSync(pedidosFile, '[]');
        if (!fs.existsSync(inventarioFile)) fs.writeFileSync(inventarioFile, JSON.stringify(inventarioBase, null, 2));
        if (!fs.existsSync(menuFile)) fs.writeFileSync(menuFile, JSON.stringify(menuBase, null, 2));
    } catch (e) {
        console.error("Error al inicializar archivos temporales:", e);
    }
}
inicializarArchivos();

function leerDatos(archivo, fallback) {
    try {
        if (!fs.existsSync(archivo)) return fallback;
        return JSON.parse(fs.readFileSync(archivo, 'utf8'));
    } catch(e) {
        return fallback;
    }
}

function guardarDatos(archivo, datos) {
    try {
        fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
    } catch(e) {
        console.error("Error al guardar archivo:", e);
    }
}

// --- RUTAS MENÚ Y PRECIOS ---
app.get('/api/menu', (req, res) => res.json(leerDatos(menuFile, menuBase)));

app.post('/api/menu/precio', (req, res) => {
    let menuActual = leerDatos(menuFile, menuBase);
    const { categoria, nombre, nuevoPrecio } = req.body;
    
    if (menuActual[categoria]) {
        let index = menuActual[categoria].findIndex(p => p.nombre === nombre);
        if (index !== -1) {
            menuActual[categoria][index].precio = parseFloat(nuevoPrecio);
            guardarDatos(menuFile, menuActual);
            return res.json({ success: true });
        }
    }
    res.status(404).json({ error: 'Producto no encontrado' });
});

// --- RUTAS PEDIDOS Y ALMACÉN ---
app.get('/api/pedidos', (req, res) => res.json(leerDatos(pedidosFile, [])));

app.post('/api/pedidos', (req, res) => {
    let pedidos = leerDatos(pedidosFile, []);
    let nuevoPedido = req.body;
    nuevoPedido.id = Date.now().toString(); 
    pedidos.push(nuevoPedido);
    guardarDatos(pedidosFile, pedidos);
    res.json({ success: true, id: nuevoPedido.id });
});

app.patch('/api/pedidos/:id', (req, res) => {
    let pedidos = leerDatos(pedidosFile, []);
    let inventario = leerDatos(inventarioFile, inventarioBase);
    let index = pedidos.findIndex(p => String(p.id) === String(req.params.id));
    
    if (index !== -1) {
        let pedido = pedidos[index];
        Object.assign(pedido, req.body); 
        if (req.body.estado === 'Cobrado') {
            pedido.items.forEach(item => {
                if (inventario[item.nombre] !== undefined) inventario[item.nombre] -= item.cantidad; 
            });
            guardarDatos(inventarioFile, inventario);
        }
        guardarDatos(pedidosFile, pedidos);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Pedido no encontrado' });
    }
});

app.get('/api/inventario', (req, res) => res.json(leerDatos(inventarioFile, inventarioBase)));

app.post('/api/inventario/modificar', (req, res) => {
    let inventario = leerDatos(inventarioFile, inventarioBase);
    const { nombre, cantidad, operacion } = req.body;
    if (inventario[nombre] === undefined) inventario[nombre] = 0;
    if (operacion === 'sumar') inventario[nombre] += parseInt(cantidad);
    else if (operacion === 'restar') inventario[nombre] -= parseInt(cantidad);
    guardarDatos(inventarioFile, inventario);
    res.json({ success: true });
});

// Inicio de servidor local si no corre como serverless en Vercel
const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
}

// Exportar la app para Vercel Serverless Functions
module.exports = app;
