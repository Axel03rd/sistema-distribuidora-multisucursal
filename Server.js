/**
 * DISTRIBUIDORA EL ISTMO — Backend API
 * Node.js + Express + MySQL2
 * 
 * Instalación:
 *   npm install express mysql2 bcryptjs cors dotenv
 * 
 * Ejecutar:
 *   node server.js
 */

const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3000;

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // sirve los archivos frontend

// ── POOL DE CONEXIÓN MySQL ──────────────────────────────────────────────────
const pool = mysql.createPool({
  host:     '127.0.0.1',
  port:     3306,
  user:     'root',
  password: '1234',
  database: 'distribuidora_istmo',
  waitForConnections: true,
  connectionLimit:    10,
});

// Helper para ejecutar queries
async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ── RUTAS: CATEGORÍAS ───────────────────────────────────────────────────────
// GET /api/categorias
app.get('/api/categorias', async (req, res) => {
  try {
    const rows = await query('SELECT id_categoria AS id, nombre FROM Categoria ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── RUTAS: PRODUCTOS ────────────────────────────────────────────────────────
// GET /api/productos  (con filtros opcionales: ?cat=1&q=papel&orden=precio_asc)
app.get('/api/productos', async (req, res) => {
  try {
    const { cat, q, orden } = req.query;

    let sql = `
      SELECT
        p.id_producto  AS id,
        p.nombre,
        p.descripcion,
        p.imagen,
        c.id_categoria AS cat_id,
        c.nombre       AS categoria,
        pp.precio
      FROM Producto p
      JOIN Categoria c ON c.id_categoria = p.id_categoria
      -- precio para cliente tipo 1 (Natural/General) por defecto
      LEFT JOIN PrecioProducto pp
        ON pp.id_producto = p.id_producto AND pp.id_tipo_cliente = 1
      WHERE 1=1
    `;
    const params = [];

    if (cat) {
      sql += ' AND p.id_categoria = ?';
      params.push(cat);
    }
    if (q) {
      sql += ' AND (p.nombre LIKE ? OR p.descripcion LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    const sortMap = {
      precio_asc:  'pp.precio ASC',
      precio_desc: 'pp.precio DESC',
      nombre:      'p.nombre ASC',
    };
    sql += ` ORDER BY ${sortMap[orden] || 'p.nombre ASC'}`;

    const rows = await query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/productos/:id
app.get('/api/productos/:id', async (req, res) => {
  try {
    const rows = await query(
      `SELECT
        p.id_producto AS id, p.nombre, p.descripcion, p.imagen,
        c.id_categoria AS cat_id, c.nombre AS categoria,
        pp.precio
       FROM Producto p
       JOIN Categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN PrecioProducto pp
         ON pp.id_producto = p.id_producto AND pp.id_tipo_cliente = 1
       WHERE p.id_producto = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── RUTAS: AUTH ─────────────────────────────────────────────────────────────
// POST /api/auth/registro
app.post('/api/auth/registro', async (req, res) => {
  const { nombre, apellido, cedula, correo, telefono, password } = req.body;

  if (!nombre || !apellido || !correo || !password)
    return res.status(400).json({ error: 'Campos obligatorios incompletos' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    // Verificar si el correo ya existe
    const existente = await query(
      'SELECT id_cliente FROM Cliente WHERE correo = ?', [correo]
    );
    if (existente.length)
      return res.status(409).json({ error: 'El correo ya está registrado' });

    // Verificar cédula duplicada si fue provista
    if (cedula) {
      const cedDup = await query(
        'SELECT id_cliente FROM ClienteNatural WHERE cedula = ?', [cedula]
      );
      if (cedDup.length)
        return res.status(409).json({ error: 'La cédula ya está registrada' });
    }

    const hash = await bcrypt.hash(password, 10);

    // Insertar en Cliente (tipo 1 = Natural)
    const [clienteResult] = await pool.execute(
      'INSERT INTO Cliente (id_tipo_cliente, correo, telefono) VALUES (1, ?, ?)',
      [correo, telefono || null]
    );
    const id_cliente = clienteResult.insertId;

    // Insertar en ClienteNatural
    await pool.execute(
      'INSERT INTO ClienteNatural (id_cliente, nombre, apellido, cedula) VALUES (?, ?, ?, ?)',
      [id_cliente, nombre, apellido, cedula || null]
    );

    // Guardar hash de contraseña en una pequeña tabla auxiliar.
    // Si no quieres crear tabla extra, puedes omitir esto y usar otro mecanismo.
    // Aquí usamos la tabla Empleado como referencia de patrón; creamos auth aparte.
    // Por simplicidad guardamos el hash en una columna extra de ClienteNatural
    // (necesitas ejecutar: ALTER TABLE ClienteNatural ADD COLUMN password_hash VARCHAR(255);)
    await pool.execute(
      'UPDATE ClienteNatural SET password_hash = ? WHERE id_cliente = ?',
      [hash, id_cliente]
    );

    res.status(201).json({
      mensaje: 'Cuenta creada exitosamente',
      cliente: { id: id_cliente, nombre, apellido, correo }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password)
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });

  try {
    const rows = await query(
      `SELECT c.id_cliente, cn.nombre, cn.apellido, c.correo, cn.password_hash
       FROM Cliente c
       JOIN ClienteNatural cn ON cn.id_cliente = c.id_cliente
       WHERE c.correo = ?`,
      [correo]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'Correo no encontrado' });

    const cliente = rows[0];
    if (!cliente.password_hash)
      return res.status(401).json({ error: 'Cuenta sin contraseña configurada' });

    const match = await bcrypt.compare(password, cliente.password_hash);
    if (!match)
      return res.status(401).json({ error: 'Contraseña incorrecta' });

    res.json({
      cliente: {
        id:       cliente.id_cliente,
        nombre:   cliente.nombre,
        apellido: cliente.apellido,
        correo:   cliente.correo,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── RUTAS: VENTAS (checkout) ────────────────────────────────────────────────
// POST /api/ventas
app.post('/api/ventas', async (req, res) => {
  const { id_cliente, items } = req.body;
  // items: [{ id_producto, cantidad, precio_unitario }]

  if (!id_cliente || !items?.length)
    return res.status(400).json({ error: 'Datos incompletos' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Crear venta (sin empleado asignado; se asigna después en el back-office)
    const [ventaRes] = await conn.execute(
      `INSERT INTO Venta (id_empleado, id_cliente, estado) VALUES (NULL, ?, 'pendiente')`,
      [id_cliente]
    );
    const id_venta = ventaRes.insertId;

    // Insertar detalles
    for (const item of items) {
      const subtotal = item.cantidad * item.precio_unitario;
      await conn.execute(
        `INSERT INTO DetalleVenta (id_venta, id_producto, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [id_venta, item.id_producto, item.cantidad, item.precio_unitario, subtotal]
      );
    }

    await conn.commit();
    res.status(201).json({ mensaje: 'Pedido registrado', id_venta });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── RUTAS: HISTORIAL ────────────────────────────────────────────────────────
// GET /api/historial/:id_cliente
app.get('/api/historial/:id_cliente', async (req, res) => {
  try {
    const ventas = await query(
      `SELECT v.id_venta, v.fecha, v.estado
       FROM Venta v
       WHERE v.id_cliente = ?
       ORDER BY v.fecha DESC`,
      [req.params.id_cliente]
    );

    // Para cada venta, cargar sus items
    for (const venta of ventas) {
      venta.items = await query(
        `SELECT dv.cantidad, dv.precio_unitario, dv.subtotal,
                p.nombre, p.imagen
         FROM DetalleVenta dv
         JOIN Producto p ON p.id_producto = dv.id_producto
         WHERE dv.id_venta = ?`,
        [venta.id_venta]
      );
    }

    res.json(ventas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ARRANQUE ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  El Istmo API corriendo en http://localhost:${PORT}`);
  console.log(`   Coloca tus archivos HTML/CSS/JS en la carpeta /public\n`);
});