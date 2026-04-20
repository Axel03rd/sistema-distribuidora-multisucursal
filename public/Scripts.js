/* ═══════════════════════════════════════════════
   DISTRIBUIDORA EL ISTMO — Scripts.js
   Conectado al API REST (server.js)
═══════════════════════════════════════════════ */

const API = 'http://localhost:3000/api';

// ── Iconos por categoría (fallback visual) ────────────────────────────────
const CAT_ICONS = {
  'Papel':                   '📄',
  'Escritura':               '🖊️',
  'Tintas e Impresión':      '🖨️',
  'Archivadores':            '🗂️',
  'Accesorios de Escritorio':'📐',
  'Sobres y Correo':         '✉️',
  'Higiene y Limpieza':      '🧹',
  'Tecnología':              '💻',
};

function catIcon(nombre) {
  return CAT_ICONS[nombre] || '📦';
}

// ── ESTADO ────────────────────────────────────────────────────────────────
let cart            = JSON.parse(localStorage.getItem('istmo-cart')   || '[]');
let user            = JSON.parse(localStorage.getItem('istmo-user')   || 'null');
let orders          = JSON.parse(localStorage.getItem('istmo-orders') || '[]');
let currentProduct  = null;
let activeCategory  = null;          // { id, nombre }
let allCategories   = [];
let allProducts     = [];            // cache de la última búsqueda

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  updateAuthNav();
  if (user) checkAuthPage();

  try {
    await loadCategories();
    await loadHomeProducts();
  } catch {
    showToast('No se pudo conectar con el servidor');
  }
});

// ── API HELPERS ───────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(API + endpoint, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// ── CATEGORÍAS ────────────────────────────────────────────────────────────
async function loadCategories() {
  allCategories = await apiFetch('/categorias');
  renderHomeCategories();
  buildCatFilters();
}

function renderHomeCategories() {
  const el = document.getElementById('home-cats');
  el.innerHTML = allCategories.map(c => `
    <div class="cat-card" onclick="filterByCategory(${c.id}, '${escHtml(c.nombre)}')">
      <div class="cat-icon">${catIcon(c.nombre)}</div>
      <div class="cat-name">${escHtml(c.nombre)}</div>
    </div>
  `).join('');
}

function buildCatFilters() {
  const el = document.getElementById('cat-filters');
  el.innerHTML = allCategories.map(c => `
    <label class="filter-option" data-cat="${c.id}">
      <input type="checkbox" data-cat="${c.id}" onchange="onCatFilter(${c.id}, '${escHtml(c.nombre)}', this)" />
      ${catIcon(c.nombre)} ${escHtml(c.nombre)}
    </label>
  `).join('');
}

// ── HOME PRODUCTS ─────────────────────────────────────────────────────────
async function loadHomeProducts() {
  const products = await apiFetch('/productos');
  // Mostrar los primeros 8 como "populares"
  const featured = products.slice(0, 8);
  document.getElementById('home-products').innerHTML = featured.map(productCard).join('');
}

// ── BÚSQUEDA ──────────────────────────────────────────────────────────────
function filterByCategory(catId, catNombre) {
  activeCategory = { id: catId, nombre: catNombre };
  showPage('search');
  document.getElementById('search-input').value = '';
  // Marcar checkbox correspondiente
  document.querySelectorAll('.filter-option[data-cat]').forEach(el => {
    const isThis = Number(el.dataset.cat) === catId;
    el.classList.toggle('active-cat', isThis);
    el.querySelector('input').checked = isThis;
  });
  runSearch();
}

function onCatFilter(catId, catNombre, checkbox) {
  activeCategory = checkbox.checked ? { id: catId, nombre: catNombre } : null;
  document.querySelectorAll('.filter-option[data-cat]').forEach(el => {
    if (Number(el.dataset.cat) !== catId) {
      el.querySelector('input').checked = false;
      el.classList.remove('active-cat');
    } else {
      el.classList.toggle('active-cat', checkbox.checked);
    }
  });
  runSearch();
}

function doNavSearch() {
  const q = document.getElementById('nav-search-input').value.trim();
  if (!q) return;
  document.getElementById('search-input').value = q;
  activeCategory = null;
  showPage('search');
  runSearch();
}

async function runSearch() {
  const q    = (document.getElementById('search-input')?.value || '').trim();
  const sort = document.getElementById('sort-select')?.value || 'default';

  const priceChecked = [...document.querySelectorAll('[data-price]:checked')]
    .map(e => e.dataset.price);

  // Construir query params
  const params = new URLSearchParams();
  if (q)                        params.set('q', q);
  if (activeCategory?.id)       params.set('cat', activeCategory.id);
  if (sort === 'price-asc')     params.set('orden', 'precio_asc');
  else if (sort === 'price-desc') params.set('orden', 'precio_desc');
  else if (sort === 'name')     params.set('orden', 'nombre');

  const container = document.getElementById('search-results');
  container.innerHTML = '<p style="color:var(--text-muted);padding:2rem">Cargando…</p>';

  try {
    let results = await apiFetch('/productos?' + params.toString());

    // Filtro de precio en cliente (BD no tiene rango directo)
    if (priceChecked.length) {
      results = results.filter(p => {
        const price = parseFloat(p.precio) || 0;
        return priceChecked.some(r => {
          const [min, max] = r.split('-').map(Number);
          return price >= min && price <= max;
        });
      });
    }

    allProducts = results;
    document.getElementById('results-count').textContent =
      `${results.length} producto${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''}`;

    container.innerHTML = results.length
      ? results.map(productCard).join('')
      : '<div class="empty-state"><div class="empty-icon">🔍</div><h3>Sin resultados</h3><p>Intenta con otra búsqueda</p></div>';
  } catch {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error al cargar</h3><p>Revisa la conexión con el servidor</p></div>';
  }
}

// ── TARJETA DE PRODUCTO ───────────────────────────────────────────────────
function productCard(p) {
  const precio  = parseFloat(p.precio) || 0;
  const imgHtml = p.imagen
    ? `<img src="${escHtml(p.imagen)}" alt="${escHtml(p.nombre)}" style="width:100%;height:100%;object-fit:cover" />`
    : `<span style="font-size:3.5rem">${catIcon(p.categoria)}</span>`;

  return `
    <div class="prod-card" onclick="showProduct(${p.id})">
      <div class="prod-img">${imgHtml}</div>
      <div class="prod-info">
        <div class="prod-cat-label">${escHtml(p.categoria || '')}</div>
        <div class="prod-name">${escHtml(p.nombre)}</div>
        <div class="prod-footer">
          <div class="prod-price">$${precio.toFixed(2)}</div>
          <button class="add-btn" onclick="event.stopPropagation(); quickAdd(${p.id})">+</button>
        </div>
      </div>
    </div>`;
}

// ── DETALLE DE PRODUCTO ───────────────────────────────────────────────────
async function showProduct(id) {
  try {
    const p = await apiFetch('/productos/' + id);
    currentProduct = p;
    const precio = parseFloat(p.precio) || 0;

    const imgHtml = p.imagen
      ? `<img src="${escHtml(p.imagen)}" alt="${escHtml(p.nombre)}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg)" />`
      : `<span style="font-size:8rem">${catIcon(p.categoria)}</span>`;

    document.getElementById('prod-img').innerHTML           = imgHtml;
    document.getElementById('prod-cat').textContent         = p.categoria;
    document.getElementById('prod-name').textContent        = p.nombre;
    document.getElementById('prod-price').textContent       = `$${precio.toFixed(2)}`;
    document.getElementById('prod-desc').textContent        = p.descripcion || '';
    document.getElementById('prod-bread-cat').textContent   = p.categoria;
    document.getElementById('prod-bread-name').textContent  = p.nombre;
    document.getElementById('qty').value = 1;

    showPage('product');
  } catch {
    showToast('Error al cargar el producto');
  }
}

function changeQty(delta) {
  const input = document.getElementById('qty');
  const v = Math.min(99, Math.max(1, parseInt(input.value) + delta));
  input.value = v;
}

function addCurrentToCart() {
  if (!currentProduct) return;
  const qty   = parseInt(document.getElementById('qty').value) || 1;
  const precio = parseFloat(currentProduct.precio) || 0;
  addToCart({ ...currentProduct, precio }, qty);
}

function quickAdd(id) {
  // Buscar en cache
  let prod = allProducts.find(p => p.id === id);
  if (prod) addToCart(prod, 1);
  else showProduct(id); // fallback: abrir detalle
}

// ── CARRITO ───────────────────────────────────────────────────────────────
function addToCart(prod, qty) {
  const existing = cart.find(i => i.id === prod.id);
  if (existing) {
    existing.qty = Math.min(99, existing.qty + qty);
  } else {
    cart.push({
      id:        prod.id,
      name:      prod.nombre,
      cat:       prod.categoria,
      price:     parseFloat(prod.precio) || 0,
      imagen:    prod.imagen || null,
      qty,
    });
  }
  saveCart();
  showToast(`✓ "${prod.nombre}" agregado al carrito`);
}

function saveCart() {
  localStorage.setItem('istmo-cart', JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cart-count');
  badge.textContent = total;
  badge.classList.toggle('visible', total > 0);
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  if (!cart.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <h3>Tu carrito está vacío</h3>
        <p>Agrega productos desde el catálogo</p>
        <button class="btn btn-primary" style="margin-top:1.5rem" onclick="showPage('search')">Ver catálogo</button>
      </div>`;
    updateCartTotals(0);
    return;
  }

  container.innerHTML = cart.map((item, idx) => {
    const imgHtml = item.imagen
      ? `<img src="${escHtml(item.imagen)}" alt="${escHtml(item.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" />`
      : `<span style="font-size:2rem">${catIcon(item.cat)}</span>`;
    return `
      <div class="cart-item">
        <div class="cart-item-img">${imgHtml}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          <div class="cart-item-cat">${escHtml(item.cat || '')}</div>
          <div class="cart-item-price">$${item.price.toFixed(2)} c/u</div>
        </div>
        <div class="cart-item-right">
          <div class="qty-input" style="border-radius:8px">
            <button class="qty-btn" onclick="changeCartQty(${idx}, -1)">−</button>
            <input class="qty-num" type="number" value="${item.qty}" min="1" max="99" readonly />
            <button class="qty-btn" onclick="changeCartQty(${idx}, 1)">+</button>
          </div>
          <div style="font-weight:600;color:var(--navy)">$${(item.price * item.qty).toFixed(2)}</div>
          <button class="remove-btn" onclick="removeFromCart(${idx})">Eliminar</button>
        </div>
      </div>`;
  }).join('');

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  updateCartTotals(subtotal);
}

function updateCartTotals(subtotal) {
  const tax   = subtotal * 0.07;
  const total = subtotal + tax;
  document.getElementById('cart-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('cart-tax').textContent      = `$${tax.toFixed(2)}`;
  document.getElementById('cart-total').textContent    = `$${total.toFixed(2)}`;
}

function changeCartQty(idx, delta) {
  cart[idx].qty = Math.min(99, Math.max(1, cart[idx].qty + delta));
  saveCart();
  renderCart();
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  saveCart();
  renderCart();
}

// ── CHECKOUT ──────────────────────────────────────────────────────────────
async function doCheckout() {
  if (!cart.length) { showToast('Tu carrito está vacío'); return; }
  if (!user) {
    showToast('Debes iniciar sesión para comprar');
    setTimeout(() => showPage('auth'), 1000);
    return;
  }

  const items = cart.map(i => ({
    id_producto:     i.id,
    cantidad:        i.qty,
    precio_unitario: i.price,
  }));

  try {
    const res = await apiFetch('/ventas', {
      method: 'POST',
      body: JSON.stringify({ id_cliente: user.id, items }),
    });

    // Guardar en historial local también
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax      = subtotal * 0.07;
    orders.unshift({
      id:       `#${String(res.id_venta).padStart(5, '0')}`,
      date:     new Date().toLocaleDateString('es-PA', { day:'numeric', month:'long', year:'numeric' }),
      status:   'processing',
      subtotal,
      tax,
      total:    subtotal + tax,
      items:    cart.map(i => ({ name: i.name, icon: catIcon(i.cat), qty: i.qty, price: i.price })),
    });
    localStorage.setItem('istmo-orders', JSON.stringify(orders));

    cart = [];
    saveCart();
    renderCart();
    showToast('✅ ¡Pedido realizado exitosamente!');
    setTimeout(() => showPage('history'), 1500);
  } catch (e) {
    showToast('Error al procesar el pedido: ' + e.message);
  }
}

// ── HISTORIAL ─────────────────────────────────────────────────────────────
async function renderHistory() {
  const container = document.getElementById('history-container');

  // Si hay sesión, intentar cargar desde API
  if (user?.id) {
    try {
      const ventas = await apiFetch('/historial/' + user.id);
      if (ventas.length) {
        container.innerHTML = ventas.map((v, i) => {
          const fecha  = new Date(v.fecha).toLocaleDateString('es-PA', { day:'numeric', month:'long', year:'numeric' });
          const total  = v.items.reduce((s, it) => s + parseFloat(it.subtotal), 0);
          return `
            <div class="history-order">
              <div class="history-order-header" onclick="toggleOrder(${i})">
                <div>
                  <div class="order-num">#${String(v.id_venta).padStart(5,'0')}</div>
                  <div class="order-date">${fecha} · $${total.toFixed(2)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:1rem">
                  <span class="order-status ${v.estado === 'aprobada' ? 'status-delivered' : 'status-processing'}">
                    ${v.estado === 'aprobada' ? 'Aprobada' : v.estado === 'cancelada' ? 'Cancelada' : 'En proceso'}
                  </span>
                  <span style="color:var(--text-muted);font-size:1.1rem">›</span>
                </div>
              </div>
              <div class="history-order-body" id="order-body-${i}">
                ${v.items.map(it => `
                  <div class="history-item">
                    <div class="history-item-icon">${catIcon('')}</div>
                    <div class="history-item-name">${escHtml(it.nombre)}</div>
                    <div class="history-item-qty">x${it.cantidad}</div>
                    <div class="history-item-price">$${parseFloat(it.subtotal).toFixed(2)}</div>
                  </div>`).join('')}
                <div style="padding:.75rem 0;display:flex;justify-content:flex-end;gap:1.5rem;font-size:.9rem">
                  <span style="font-weight:600;color:var(--navy)">Total: $${total.toFixed(2)}</span>
                </div>
              </div>
            </div>`;
        }).join('');
        return;
      }
    } catch { /* fallback al historial local */ }
  }

  // Historial local (localStorage)
  if (!orders.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>Sin pedidos aún</h3>
        <p>Tus compras aparecerán aquí</p>
        <button class="btn btn-primary" style="margin-top:1.5rem" onclick="showPage('search')">Ir al catálogo</button>
      </div>`;
    return;
  }

  container.innerHTML = orders.map((o, i) => `
    <div class="history-order">
      <div class="history-order-header" onclick="toggleOrder(${i})">
        <div>
          <div class="order-num">${o.id}</div>
          <div class="order-date">${o.date} · $${o.total.toFixed(2)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:1rem">
          <span class="order-status ${o.status === 'delivered' ? 'status-delivered' : 'status-processing'}">
            ${o.status === 'delivered' ? 'Entregado' : 'En proceso'}
          </span>
          <span style="color:var(--text-muted);font-size:1.1rem">›</span>
        </div>
      </div>
      <div class="history-order-body" id="order-body-${i}">
        ${o.items.map(item => `
          <div class="history-item">
            <div class="history-item-icon">${item.icon}</div>
            <div class="history-item-name">${escHtml(item.name)}</div>
            <div class="history-item-qty">x${item.qty}</div>
            <div class="history-item-price">$${(item.price * item.qty).toFixed(2)}</div>
          </div>`).join('')}
        <div style="padding:.75rem 0;display:flex;justify-content:flex-end;gap:1.5rem;font-size:.9rem">
          <span style="color:var(--text-muted)">Subtotal: $${o.subtotal.toFixed(2)}</span>
          <span style="color:var(--text-muted)">ITBMS: $${o.tax.toFixed(2)}</span>
          <span style="font-weight:600;color:var(--navy)">Total: $${o.total.toFixed(2)}</span>
        </div>
      </div>
    </div>`).join('');
}

function toggleOrder(i) {
  document.getElementById('order-body-' + i)?.classList.toggle('open');
}

// ── AUTH ──────────────────────────────────────────────────────────────────
function switchAuth(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').classList.toggle('active', tab === 'login');
  document.getElementById('form-register').classList.toggle('active', tab === 'register');
}

function checkAuthPage() {
  const loggedDiv = document.getElementById('auth-logged');
  const loginForm = document.getElementById('form-login');
  const regForm   = document.getElementById('form-register');
  const tabs      = document.querySelector('.auth-tabs');
  if (user) {
    loggedDiv.style.display = 'block';
    loginForm.classList.remove('active');
    regForm.classList.remove('active');
    tabs.style.display = 'none';
    document.getElementById('auth-welcome').textContent =
      '¡Bienvenido, ' + user.nombre + ' ' + (user.apellido || '') + '!';
  } else {
    loggedDiv.style.display = 'none';
    tabs.style.display = 'flex';
    loginForm.classList.add('active');
  }
}

async function doLogin() {
  const correo   = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!correo || !password) { showToast('Completa todos los campos'); return; }

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo, password }),
    });
    user = data.cliente;
    localStorage.setItem('istmo-user', JSON.stringify(user));
    updateAuthNav();
    checkAuthPage();
    showToast('✓ Sesión iniciada · Bienvenido/a!');
  } catch (e) {
    showToast(e.message);
  }
}

async function doRegister() {
  const nombre   = document.getElementById('reg-name').value.trim();
  const apellido = document.getElementById('reg-apellido')?.value.trim() || '';
  const cedula   = document.getElementById('reg-cedula')?.value.trim()   || '';
  const correo   = document.getElementById('reg-email').value.trim();
  const telefono = document.getElementById('reg-telefono')?.value.trim() || '';
  const password = document.getElementById('reg-pass').value;
  const pass2    = document.getElementById('reg-pass2').value;

  if (!nombre || !correo || !password) { showToast('Completa todos los campos obligatorios'); return; }
  if (password !== pass2)              { showToast('Las contraseñas no coinciden'); return; }
  if (password.length < 6)            { showToast('La contraseña debe tener al menos 6 caracteres'); return; }

  try {
    const data = await apiFetch('/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre, apellido, cedula, correo, telefono, password }),
    });
    user = data.cliente;
    localStorage.setItem('istmo-user', JSON.stringify(user));
    updateAuthNav();
    checkAuthPage();
    showToast('¡Cuenta creada! Bienvenido/a, ' + nombre);
  } catch (e) {
    showToast(e.message);
  }
}

function doLogout() {
  user = null;
  localStorage.removeItem('istmo-user');
  updateAuthNav();
  checkAuthPage();
  showToast('Sesión cerrada');
}

function updateAuthNav() {
  const greeting = document.getElementById('user-greeting');
  const label    = document.getElementById('nav-auth-label');
  const nameEl   = document.getElementById('user-name-nav');
  if (user) {
    greeting.style.display = 'inline';
    nameEl.textContent     = user.nombre?.split(' ')[0] || 'Usuario';
    label.textContent      = 'Mi cuenta';
  } else {
    greeting.style.display = 'none';
    label.textContent      = 'Ingresar';
  }
}

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  window.scrollTo(0, 0);
  if (page === 'cart')    renderCart();
  if (page === 'history') renderHistory();
  if (page === 'auth')    checkAuthPage();
  if (page === 'search')  runSearch();
}

// ── UTILIDADES ────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}