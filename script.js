/* =========================================
   ÉLITE SPORT — script.js
   Supabase Auth + API backend + Mercado Pago
   ========================================= */
'use strict';

/* ─── UTILS ─── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const formatPrice = n => '$' + Number(n).toLocaleString('es-AR');

function showToast(msg) {
  $('toast-msg').textContent = msg;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2800);
}
function showFieldError(inputId, errId, msg) {
  const i = $(inputId); if (i) i.classList.add('invalid');
  const e = $(errId);   if (e) e.textContent = msg;
}
function clearFieldError(inputId, errId) {
  const i = $(inputId); if (i) i.classList.remove('invalid');
  const e = $(errId);   if (e) e.textContent = '';
}

/* ─── ESTADO ─── */
const state = {
  user:           null,   // perfil de Supabase
  session:        null,   // sesión activa
  cart:           JSON.parse(localStorage.getItem('es_cart')     || '[]'),
  wishlist:       JSON.parse(localStorage.getItem('es_wishlist') || '[]'),
  products:       [],     // cargados desde /api/productos
  filter:         'all',
  visibleCount:   8,
  currentProduct: null,
  productQty:     1,
  productSize:    null,
};
const saveCart     = () => localStorage.setItem('es_cart',     JSON.stringify(state.cart));
const saveWishlist = () => localStorage.setItem('es_wishlist', JSON.stringify(state.wishlist));

/* ─── OVERLAY ─── */
const overlay = $('overlay');
const openOverlay  = () => { overlay.classList.add('active');    document.body.style.overflow = 'hidden'; };
const closeOverlay = () => { overlay.classList.remove('active'); document.body.style.overflow = ''; };
overlay.addEventListener('click', closeAll);

function closeAll() {
  closeAuthModal(); closeCart(); closeProductModal();
  closeCheckoutModal(); closeSearch(); closeMobileMenu();
  closeOrdersPanel(); closeAccountDropdown();
}

/* ─── HEADER SCROLL ─── */
window.addEventListener('scroll', () =>
  $('header').classList.toggle('scrolled', window.scrollY > 40), { passive: true });

/* ─── ANNOUNCEMENT BAR ─── */
const annMsgs = [
  'ENVÍOS GRATUITOS EN COMPRAS SUPERIORES A $50.000 &nbsp;|&nbsp; DEVOLUCIONES SIN CARGO',
  'NUEVA COLECCIÓN OTOÑO / INVIERNO 2026 &nbsp;|&nbsp; HASTA 20% OFF EN PRIMERAS COMPRAS',
  'ÉLITE SPORT CLUB: SUMATE Y OBTENÉ 5% OFF EN CADA COMPRA',
];
let annIdx = 0;
const setAnn = i => { annIdx = (i + annMsgs.length) % annMsgs.length; $('ann-text').innerHTML = annMsgs[annIdx]; };
$('ann-prev').addEventListener('click', () => setAnn(annIdx - 1));
$('ann-next').addEventListener('click', () => setAnn(annIdx + 1));
$('ann-close').addEventListener('click', () => $('ann-bar').style.display = 'none');
setInterval(() => setAnn(annIdx + 1), 5000);

/* ─── MOBILE MENU ─── */
const closeMobileMenu = () => $('mobile-menu').classList.remove('open');
$('hamburger').addEventListener('click', () => { $('mobile-menu').classList.add('open'); openOverlay(); });
$('mobile-menu-close').addEventListener('click', () => { closeMobileMenu(); closeOverlay(); });
$$('.mobile-nav-link').forEach(a => a.addEventListener('click', () => { closeMobileMenu(); closeOverlay(); }));
$('mobile-login-btn').addEventListener('click', e => { e.preventDefault(); closeMobileMenu(); closeOverlay(); openAuthModal(); });
$('mobile-orders-btn').addEventListener('click', e => { e.preventDefault(); closeMobileMenu(); closeOverlay(); openOrdersPanel(); });

/* ─── BÚSQUEDA ─── */
const closeSearch = () => $('search-panel').classList.remove('open');
$('search-btn').addEventListener('click', () => { $('search-panel').classList.add('open'); openOverlay(); $('search-input').focus(); });
$('search-close').addEventListener('click', () => { closeSearch(); closeOverlay(); });

$('search-input').addEventListener('input', function () {
  const q = this.value.trim().toLowerCase();
  const res = $('search-results');
  if (!q) { res.innerHTML = ''; return; }
  const matches = state.products.filter(p =>
    p.name.toLowerCase().includes(q) || p.sport.toLowerCase().includes(q)
  );
  if (!matches.length) { res.innerHTML = `<p class="search-no-results">Sin resultados para "${this.value}"</p>`; return; }
  res.innerHTML = matches.slice(0, 8).map(p => `
    <div class="search-result-item" data-id="${p.id}">
      <div class="search-result-img"><img src="${p.img}" alt="${p.name}" loading="lazy"></div>
      <div><p class="search-result-sport">${p.sport.toUpperCase()}</p><p class="search-result-name">${p.name}</p></div>
      <span class="search-result-price">${formatPrice(p.price)}</span>
    </div>`).join('');
  res.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const prod = state.products.find(p => p.id === +item.dataset.id);
      closeSearch(); closeOverlay();
      $('search-input').value = ''; res.innerHTML = '';
      if (prod) openProductModal(prod);
    });
  });
});

/* ══════════════════════════════════════════
   AUTH — Supabase
══════════════════════════════════════════ */
const openAuthModal  = (tab) => { $('auth-modal').classList.add('open'); openOverlay(); if (tab) switchAuthTab(tab); };
const closeAuthModal = () => $('auth-modal').classList.remove('open');

$('auth-close').addEventListener('click', () => { closeAuthModal(); closeOverlay(); });
$('footer-login-link').addEventListener('click', e => { e.preventDefault(); openAuthModal(); });
$('join-club-btn').addEventListener('click', () => openAuthModal('register'));

$$('.auth-tab').forEach(btn => btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab)));
function switchAuthTab(tab) {
  $$('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.auth-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
}
$$('.toggle-pass').forEach(btn => btn.addEventListener('click', () => {
  const inp = btn.previousElementSibling;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}));

/* LOGIN */
$('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const pass  = $('login-pass').value;
  let ok = true;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError('login-email','login-email-err','Email inválido'); ok=false; } else clearFieldError('login-email','login-email-err');
  if (pass.length < 6) { showFieldError('login-pass','login-pass-err','Mínimo 6 caracteres'); ok=false; } else clearFieldError('login-pass','login-pass-err');
  if (!ok) return;

  const btn = $('login-btn');
  btn.textContent = 'Ingresando...'; btn.disabled = true;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  btn.textContent = 'INGRESAR'; btn.disabled = false;
  if (error) { showFieldError('login-pass','login-pass-err','Email o contraseña incorrectos'); return; }
  state.session = data.session;
  state.user    = await cargarPerfil(data.user);
  updateAuthUI();
  closeAuthModal(); closeOverlay();
  showToast(`Bienvenido, ${state.user?.nombre || email.split('@')[0]}!`);
});

/* REGISTRO */
$('register-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const name     = $('reg-name').value.trim();
  const lastname = $('reg-lastname').value.trim();
  const email    = $('reg-email').value.trim();
  const pass     = $('reg-pass').value;
  let ok = true;
  if (!name)     { showFieldError('reg-name','reg-name-err','Ingresá tu nombre'); ok=false; }     else clearFieldError('reg-name','reg-name-err');
  if (!lastname) { showFieldError('reg-lastname','reg-lastname-err','Ingresá tu apellido'); ok=false; } else clearFieldError('reg-lastname','reg-lastname-err');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError('reg-email','reg-email-err','Email inválido'); ok=false; } else clearFieldError('reg-email','reg-email-err');
  if (pass.length < 6) { showFieldError('reg-pass','reg-pass-err','Mínimo 6 caracteres'); ok=false; } else clearFieldError('reg-pass','reg-pass-err');
  if (!ok) return;

  const btn = $('register-btn');
  btn.textContent = 'Creando cuenta...'; btn.disabled = true;
  const { data, error } = await supabaseClient.auth.signUp({
    email, password: pass,
    options: { data: { nombre: name, apellido: lastname } }
  });
  btn.textContent = 'CREAR CUENTA'; btn.disabled = false;
  if (error) { showFieldError('reg-email','reg-email-err', error.message); return; }
  if (!data.session) {
    closeAuthModal(); closeOverlay();
    showToast('Cuenta creada. Revisá tu email para confirmar.');
    return;
  }
  state.session = data.session;
  state.user    = await cargarPerfil(data.user);
  updateAuthUI();
  closeAuthModal(); closeOverlay();
  showToast(`Bienvenido, ${name}!`);
});

/* CUENTA — dropdown */
const closeAccountDropdown = () => $('account-dropdown').style.display = 'none';
$('account-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!state.user) { openAuthModal('login'); return; }
  const dd = $('account-dropdown');
  dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', closeAccountDropdown);
$('dd-orders').addEventListener('click', () => { closeAccountDropdown(); openOrdersPanel(); });
$('dd-logout').addEventListener('click', async () => {
  closeAccountDropdown();
  await supabaseClient.auth.signOut();
  state.user = null; state.session = null;
  updateAuthUI();
  showToast('Sesión cerrada');
});

async function cargarPerfil(authUser) {
  if (!authUser) return null;
  const { data } = await supabaseClient.from('profiles')
    .select('nombre, apellido, rol, es_socio')
    .eq('id', authUser.id).single();
  return data ? { ...data, email: authUser.email, id: authUser.id } : { nombre: authUser.email.split('@')[0], email: authUser.email, id: authUser.id };
}

async function obtenerToken() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session?.access_token || null;
}

function updateAuthUI() {
  const label        = $('user-name-label');
  const mobileOrders = $('mobile-orders-btn');
  const footerOrders = $('footer-orders-link');
  if (state.user) {
    label.textContent = state.user.nombre || state.user.email.split('@')[0];
    label.style.display = 'inline';
    mobileOrders.style.display = 'block';
    footerOrders.style.display = 'block';
  } else {
    label.style.display = 'none';
    mobileOrders.style.display = 'none';
    footerOrders.style.display = 'none';
  }
}

/* ══════════════════════════════════════════
   MIS PEDIDOS — lee orders de Supabase
══════════════════════════════════════════ */
const closeOrdersPanel = () => $('orders-panel').classList.remove('open');

async function openOrdersPanel() {
  if (!state.user) { openAuthModal('login'); return; }
  $('orders-panel').classList.add('open');
  openOverlay();
  await cargarPedidos();
}

$('orders-close').addEventListener('click', () => { closeOrdersPanel(); closeOverlay(); });
$('orders-shop-cta').addEventListener('click', () => { closeOrdersPanel(); closeOverlay(); $('novedades').scrollIntoView({ behavior:'smooth' }); });
$('footer-orders-link').addEventListener('click', e => { e.preventDefault(); openOrdersPanel(); });

const ESTADO_LABEL = {
  pendiente: { txt: 'Pendiente de pago', cls: 'badge-pending'  },
  pagado:    { txt: 'Pagado',            cls: 'badge-paid'     },
  enviado:   { txt: 'Enviado',           cls: 'badge-shipped'  },
  entregado: { txt: 'Entregado',         cls: 'badge-done'     },
  cancelado: { txt: 'Cancelado',         cls: 'badge-cancelled'},
  devuelto:  { txt: 'Devuelto',          cls: 'badge-cancelled'},
};

async function cargarPedidos() {
  $('orders-loading').style.display = 'flex';
  $('orders-empty').style.display   = 'none';
  $('orders-list').innerHTML        = '';

  const { data: orders, error } = await supabaseClient
    .from('orders')
    .select(`
      id, estado, total, subtotal, envio, created_at, medio_de_pago, direccion_envio,
      order_items (
        cantidad, precio_unitario,
        product_variants ( talle, products ( nombre, imagen_url ) )
      )
    `)
    .eq('customer_id', state.user.id)
    .order('created_at', { ascending: false });

  $('orders-loading').style.display = 'none';

  if (error || !orders?.length) {
    $('orders-empty').style.display = 'flex'; return;
  }

  $('orders-list').innerHTML = orders.map(order => {
    const est   = ESTADO_LABEL[order.estado] || { txt: order.estado, cls: 'badge-pending' };
    const fecha = new Date(order.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
    const items = order.order_items.map(it => {
      const p = it.product_variants?.products;
      return `
        <div class="order-item">
          <div class="order-item-img"><img src="${p?.imagen_url || ''}" alt="${p?.nombre || ''}" loading="lazy"></div>
          <div class="order-item-info">
            <p class="order-item-name">${p?.nombre || 'Producto'}</p>
            <p class="order-item-meta">Talle ${it.product_variants?.talle || '—'} &middot; Cant. ${it.cantidad} &middot; ${formatPrice(it.precio_unitario)}</p>
          </div>
        </div>`;
    }).join('');

    const dir = order.direccion_envio || {};
    const dirStr = dir.direccion ? `${dir.direccion}, ${dir.ciudad} (CP ${dir.cp})` : '—';

    return `
      <li class="order-card">
        <div class="order-card-header">
          <div>
            <p class="order-card-num">Orden #${order.id}</p>
            <p class="order-card-date">${fecha}</p>
          </div>
          <span class="order-badge ${est.cls}">${est.txt}</span>
        </div>
        <div class="order-card-items">${items}</div>
        <div class="order-card-footer">
          <div class="order-card-addr">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${dirStr}
          </div>
          <div class="order-card-total">
            <span>Envío: ${order.envio > 0 ? formatPrice(order.envio) : 'Gratis'}</span>
            <strong>Total: ${formatPrice(order.total)}</strong>
          </div>
        </div>
      </li>`;
  }).join('');
}

/* ══════════════════════════════════════════
   CATÁLOGO — carga desde backend
══════════════════════════════════════════ */
async function cargarProductos() {
  try {
    const r = await fetch(API_URL + '/api/productos');
    if (!r.ok) throw new Error('Error ' + r.status);
    state.products = await r.json();
  } catch (err) {
    console.warn('Backend no disponible, usando catálogo local', err);
    // Fallback: catálogo local mínimo para que la página funcione sin el server
    state.products = FALLBACK_PRODUCTS;
  }
  renderProducts();
}

/* ══════════════════════════════════════════
   MODAL DE PRODUCTO
══════════════════════════════════════════ */
const closeProductModal = () => $('product-modal').classList.remove('open');

function openProductModal(product) {
  state.currentProduct = product;
  state.productQty     = 1;
  state.productSize    = null;

  $('pm-img').innerHTML = `<img src="${product.img}" alt="${product.name}" decoding="async">`;
  $('pm-sport').textContent = product.sport.toUpperCase();
  $('pm-name').textContent  = product.name;
  $('pm-desc').textContent  = product.desc || '';
  $('pm-price').textContent = formatPrice(product.price);
  $('pm-old').textContent   = product.oldPrice ? formatPrice(product.oldPrice) : '';
  $('pm-qty-val').textContent = '1';

  const sizesEl = $('pm-sizes');
  sizesEl.innerHTML = (product.sizes || []).map(s => {
    const sinStock = product.stock && product.stock[s] === 0;
    return `<button class="size-btn${sinStock ? ' size-btn--out' : ''}" data-size="${s}" ${sinStock ? 'disabled title="Sin stock"' : ''}>${s}</button>`;
  }).join('');
  sizesEl.querySelectorAll('.size-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      sizesEl.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.productSize = btn.dataset.size;
    });
  });

  $('product-modal').classList.add('open');
  openOverlay();
}

$('product-close').addEventListener('click', () => { closeProductModal(); closeOverlay(); });
$('pm-qty-minus').addEventListener('click', () => { if (state.productQty > 1) { state.productQty--; $('pm-qty-val').textContent = state.productQty; } });
$('pm-qty-plus').addEventListener('click',  () => { if (state.productQty < 10) { state.productQty++; $('pm-qty-val').textContent = state.productQty; } });
$('pm-add-btn').addEventListener('click', () => {
  if (!state.productSize) { showToast('Seleccioná un talle primero'); return; }
  addToCart(state.currentProduct, state.productSize, state.productQty);
  closeProductModal(); closeOverlay(); openCart();
});

/* ══════════════════════════════════════════
   CARRITO
══════════════════════════════════════════ */
const closeCart = () => $('cart-panel').classList.remove('open');

function openCart() { $('cart-panel').classList.add('open'); openOverlay(); renderCart(); }

$('cart-btn').addEventListener('click', openCart);
$('cart-close').addEventListener('click', () => { closeCart(); closeOverlay(); });
$('cart-empty-cta').addEventListener('click', () => { closeCart(); closeOverlay(); $('novedades').scrollIntoView({ behavior:'smooth' }); });
$('clear-cart-btn').addEventListener('click', () => { if (confirm('¿Vaciar el carrito?')) { state.cart = []; saveCart(); updateCartBadge(); renderCart(); } });

function addToCart(product, size, qty = 1) {
  const existing = state.cart.find(i => i.id === product.id && i.size === size);
  if (existing) existing.qty = Math.min(existing.qty + qty, 10);
  else state.cart.push({ id: product.id, name: product.name, sport: product.sport, price: product.price, img: product.img, size, qty });
  saveCart(); updateCartBadge();
  showToast(`${product.name} agregado al carrito`);
}

function removeFromCart(id, size) { state.cart = state.cart.filter(i => !(i.id === id && i.size === size)); saveCart(); updateCartBadge(); renderCart(); }
function updateQtyCart(id, size, delta) {
  const item = state.cart.find(i => i.id === id && i.size === size);
  if (!item) return;
  item.qty = Math.max(1, Math.min(10, item.qty + delta));
  saveCart(); renderCart();
}

function updateCartBadge() {
  const total = state.cart.reduce((s, i) => s + i.qty, 0);
  $('cart-badge').textContent = total;
  $('cart-badge').style.transform = 'scale(1.4)';
  setTimeout(() => $('cart-badge').style.transform = 'scale(1)', 200);
}

function renderCart() {
  const items  = $('cart-items');
  const empty  = $('cart-empty');
  const footer = $('cart-footer');
  const total  = state.cart.reduce((s, i) => s + i.qty, 0);
  $('cart-count-label').textContent = `(${total})`;

  if (!state.cart.length) { empty.style.display='flex'; items.innerHTML=''; footer.style.display='none'; return; }
  empty.style.display='none'; footer.style.display='flex';

  items.innerHTML = state.cart.map(it => `
    <li class="cart-item" data-id="${it.id}" data-size="${it.size}">
      <div class="cart-item__img"><img src="${it.img}" alt="${it.name}" loading="lazy"></div>
      <div class="cart-item__info">
        <p class="cart-item__sport">${it.sport.toUpperCase()}</p>
        <p class="cart-item__name">${it.name}</p>
        <p class="cart-item__size">Talle: ${it.size}</p>
        <div class="cart-item__qty">
          <button class="cart-item__qty-btn" data-action="minus">−</button>
          <span class="cart-item__qty-val">${it.qty}</span>
          <button class="cart-item__qty-btn" data-action="plus">+</button>
        </div>
      </div>
      <div class="cart-item__right">
        <span class="cart-item__price">${formatPrice(it.price * it.qty)}</span>
        <button class="cart-item__remove">Quitar</button>
      </div>
    </li>`).join('');

  items.querySelectorAll('.cart-item__qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.cart-item');
      updateQtyCart(+li.dataset.id, li.dataset.size, btn.dataset.action === 'plus' ? 1 : -1);
    });
  });
  items.querySelectorAll('.cart-item__remove').forEach(btn => {
    btn.addEventListener('click', () => { const li = btn.closest('.cart-item'); removeFromCart(+li.dataset.id, li.dataset.size); });
  });

  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const envio    = subtotal >= 50000 ? 0 : 3500;
  $('cart-subtotal-val').textContent = formatPrice(subtotal);
  $('cart-shipping-val').textContent = envio === 0 ? 'Gratis' : formatPrice(envio);
  $('cart-total-val').textContent    = formatPrice(subtotal + envio);
}

$('checkout-btn').addEventListener('click', () => {
  if (!state.user) { closeCart(); openAuthModal('login'); showToast('Iniciá sesión para finalizar tu compra'); return; }
  closeCart(); openCheckoutModal();
});

/* ══════════════════════════════════════════
   CHECKOUT → MERCADO PAGO
══════════════════════════════════════════ */
const closeCheckoutModal = () => $('checkout-modal').classList.remove('open');

function openCheckoutModal() {
  // Rellenar resumen
  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const envio    = subtotal >= 50000 ? 0 : 3500;
  $('checkout-items-list').innerHTML = state.cart.map(it => `
    <li class="checkout-item">
      <div class="checkout-item-img"><img src="${it.img}" alt="${it.name}" loading="lazy"></div>
      <span class="checkout-item-name">${it.name}</span>
      <span class="checkout-item-qty">×${it.qty} (T: ${it.size})</span>
      <span class="checkout-item-price">${formatPrice(it.price * it.qty)}</span>
    </li>`).join('');
  $('co-subtotal').textContent = formatPrice(subtotal);
  $('co-envio').textContent    = envio === 0 ? 'Gratis' : formatPrice(envio);
  $('co-total').textContent    = formatPrice(subtotal + envio);

  // Pre-llenar con datos del usuario
  if (state.user) {
    if ($('co-name'))     $('co-name').value     = state.user.nombre   || '';
    if ($('co-lastname')) $('co-lastname').value = state.user.apellido || '';
  }

  const btn = $('co-submit-btn');
  btn.textContent = 'PAGAR CON MERCADO PAGO'; btn.disabled = false;
  $('co-error-msg').style.display = 'none';
  $('checkout-step-1').style.display = 'block';
  $('checkout-step-2').style.display = 'none';

  $('checkout-modal').classList.add('open'); openOverlay();
}

$('checkout-close').addEventListener('click', () => { closeCheckoutModal(); closeOverlay(); });

$('checkout-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const btn = $('co-submit-btn');

  // Validar campos básicos
  const campos = { nombre: $('co-name').value.trim(), apellido: $('co-lastname').value.trim(),
    direccion: $('co-address').value.trim(), ciudad: $('co-city').value.trim(),
    cp: $('co-cp').value.trim(), telefono: $('co-phone').value.trim() };
  for (const [k, v] of Object.entries(campos)) {
    if (!v) { mostrarCoError(`Completá el campo "${k}"`); return; }
  }

  btn.textContent = 'Procesando...'; btn.disabled = true;
  $('co-error-msg').style.display = 'none';

  try {
    const token = await obtenerToken();
    if (!token) throw new Error('Tu sesión venció. Volvé a iniciar sesión.');

    const body = {
      items: state.cart.map(i => ({ id: i.id, size: i.size, qty: i.qty })),
      envio: campos
    };

    const r = await fetch(API_URL + '/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error al crear el pedido');

    // Vaciar carrito
    state.cart = []; saveCart(); updateCartBadge();

    // Redirigir a Mercado Pago
    $('order-number').textContent = data.orderId;
    $('checkout-step-1').style.display = 'none';
    $('checkout-step-2').style.display = 'block';

    // Esperar 2 segundos y redirigir
    setTimeout(() => { window.location.href = data.init_point; }, 2000);

  } catch (err) {
    mostrarCoError(err.message);
    btn.textContent = 'PAGAR CON MERCADO PAGO'; btn.disabled = false;
  }
});

function mostrarCoError(msg) {
  const el = $('co-error-msg');
  el.textContent = msg; el.style.display = 'block';
}

/* ── Retorno desde Mercado Pago ── */
async function manejarRetornoPago() {
  const p = new URLSearchParams(window.location.search);
  const paymentId = p.get('payment_id');
  const orderId   = p.get('external_reference');
  const status    = p.get('status');
  if (!orderId) return;

  // Limpiar URL
  history.replaceState(null, '', window.location.pathname);

  const token = await obtenerToken();
  if (!token) return;

  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  if (!paymentId || status === 'failure') {
    await fetch(`${API_URL}/api/pedidos/${orderId}/cancelar`, { method:'POST', headers });
    showToast('El pago no se completó. Tu carrito fue restaurado.');
    return;
  }

  try {
    const r = await fetch(`${API_URL}/api/pedidos/${orderId}/confirmar-pago`, {
      method: 'POST', headers, body: JSON.stringify({ payment_id: paymentId })
    });
    const data = await r.json();
    if (data.estado === 'pagado') showToast(`¡Pedido #${orderId} confirmado! 🎉`);
    else if (data.estado === 'pendiente') showToast('Pago pendiente de acreditación.');
    else showToast('Hubo un problema con tu pago. Contactanos.');
  } catch { /* silencioso */ }
}

/* ══════════════════════════════════════════
   GRILLA DE PRODUCTOS + FILTROS
══════════════════════════════════════════ */
function getFiltered() {
  return state.filter === 'all' ? state.products : state.products.filter(p => p.sport === state.filter);
}

function renderProducts() {
  const grid     = $('products-grid');
  const filtered = getFiltered();
  const visible  = filtered.slice(0, state.visibleCount);
  $('load-more-wrap').style.display = filtered.length > state.visibleCount ? 'block' : 'none';

  if (!state.products.length) {
    grid.innerHTML = '<div class="products-loading"><div class="spinner"></div><p>Cargando catálogo...</p></div>'; return;
  }
  if (!visible.length) {
    grid.innerHTML = '<p style="text-align:center;color:var(--mid);padding:40px 0;grid-column:1/-1">No hay productos en esta categoría todavía.</p>'; return;
  }

  grid.innerHTML = visible.map(p => `
    <div class="product-card" data-id="${p.id}" data-sport="${p.sport}">
      <div class="product-img-wrap">
        <div class="product-img"><img src="${p.img}" alt="${p.name}" loading="lazy" decoding="async"></div>
        ${p.badge ? `<span class="product-badge${p.badge.includes('−')||p.badge.includes('%')?' product-badge--sale':''}">${p.badge}</span>` : ''}
        <button class="quick-add" data-id="${p.id}" aria-label="Agregar">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </button>
        <button class="wishlist-btn ${state.wishlist.includes(p.id) ? 'active' : ''}" data-id="${p.id}" aria-label="Guardar">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      <div class="product-info">
        <p class="product-sport">${p.sport.toUpperCase()}</p>
        <h4 class="product-name">${p.name}</h4>
        ${p.oldPrice
          ? `<div class="product-price-wrap"><p class="product-price">${formatPrice(p.price)}</p><p class="product-price--old">${formatPrice(p.oldPrice)}</p></div>`
          : `<p class="product-price">${formatPrice(p.price)}</p>`}
      </div>
    </div>`).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.quick-add') || e.target.closest('.wishlist-btn')) return;
      const prod = state.products.find(p => p.id === +card.dataset.id);
      if (prod) openProductModal(prod);
    });
  });
  grid.querySelectorAll('.quick-add').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); const prod = state.products.find(p => p.id === +btn.dataset.id); if (prod) openProductModal(prod); });
  });
  grid.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleWishlist(+btn.dataset.id, btn); });
  });

  // Animación entrada
  grid.querySelectorAll('.product-card').forEach((el, i) => {
    el.style.opacity = '0'; el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity 0.4s ease ${i*40}ms, transform 0.4s ease ${i*40}ms`;
    requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateY(0)'; });
  });
}

function toggleWishlist(id, btn) {
  const idx = state.wishlist.indexOf(id);
  if (idx === -1) { state.wishlist.push(id); btn.classList.add('active'); showToast('Guardado en lista de deseos'); }
  else { state.wishlist.splice(idx,1); btn.classList.remove('active'); showToast('Eliminado de lista de deseos'); }
  saveWishlist();
}

$$('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.filter = btn.dataset.filter; state.visibleCount = 8; renderProducts();
}));
$('load-more-btn').addEventListener('click', () => { state.visibleCount += 8; renderProducts(); });
$('show-all-products').addEventListener('click', e => {
  e.preventDefault();
  state.filter = 'all'; state.visibleCount = state.products.length;
  $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  renderProducts(); $('novedades').scrollIntoView({ behavior: 'smooth' });
});

$$('.sport-card').forEach(card => card.addEventListener('click', () => {
  const sport = card.dataset.sport;
  if (!sport) return;
  const targetBtn = Array.from($$('.filter-btn')).find(b => b.dataset.filter === sport);
  if (targetBtn) {
    $$('.filter-btn').forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');
    state.filter = sport;
    state.visibleCount = 8;
    renderProducts();
  }
  $('novedades').scrollIntoView({ behavior: 'smooth' });
}));

/* ══════════════════════════════════════════
   ANIMACIONES
══════════════════════════════════════════ */
const revObs = new IntersectionObserver((entries) => {
  entries.forEach((e,i) => { if (!e.isIntersecting) return;
    setTimeout(() => { e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; }, i*55);
    revObs.unobserve(e.target); });
}, { threshold: 0.08 });

['.sport-card','.collection-card','.tech-item','.stat-item','.badge-item'].forEach(s =>
  $$(s).forEach(el => { el.style.opacity='0'; el.style.transform='translateY(22px)'; el.style.transition='opacity 0.5s ease, transform 0.5s ease'; revObs.observe(el); })
);

const titleObs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (!e.isIntersecting) return; e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; titleObs.unobserve(e.target); });
}, { threshold: 0.1 });
$$('.section-title, .hero-title').forEach(el => {
  el.style.opacity='0'; el.style.transform='translateY(28px)'; el.style.transition='opacity 0.7s ease, transform 0.7s ease'; titleObs.observe(el);
});

const cntObs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (!e.isIntersecting) return;
    const el=e.target, text=el.textContent, num=parseFloat(text.replace(/[^0-9.]/g,'')), suf=text.replace(/[0-9.]/g,'');
    let start=0; const step=num/(1500/16);
    const t=setInterval(()=>{ start+=step; if(start>=num){el.textContent=text;clearInterval(t);}
      else el.textContent=(Number.isInteger(num)?Math.floor(start):start.toFixed(1))+suf; },16);
    cntObs.unobserve(el); });
}, { threshold: 0.5 });
$$('.stat-number').forEach(el => cntObs.observe(el));

/* Hero indicators */
const indicators = $$('.indicator');
let slide=0, slideTimer;
const setSlide = i => { indicators.forEach(x=>x.classList.remove('active')); indicators[i].classList.add('active'); slide=i; };
indicators.forEach((ind,i) => ind.addEventListener('click', () => { setSlide(i); clearInterval(slideTimer); slideTimer=setInterval(()=>setSlide((slide+1)%indicators.length),4000); }));
slideTimer = setInterval(() => setSlide((slide+1)%indicators.length), 4000);

/* Nav activo */
window.addEventListener('scroll', () => {
  let cur=''; $$('section[id]').forEach(s => { if (window.scrollY >= s.offsetTop-120) cur=s.id; });
  $$('.nav-left a').forEach(a => a.style.opacity = a.getAttribute('href')==='#'+cur ? '1' : '0.65');
}, { passive:true });

document.addEventListener('keydown', e => { if (e.key==='Escape') { closeAll(); closeOverlay(); } });

/* ══════════════════════════════════════════
   CATÁLOGO FALLBACK (si el backend no está corriendo)
══════════════════════════════════════════ */
const FALLBACK_PRODUCTS = [
  { id:1, name:'Remera Performance Dry-Fit', sport:'tenis', price:12990, badge:'NUEVO', img:'img/Tenis/prenda_01.jpg', sizes:['XS','S','M','L','XL'], desc:'Tejido Dry-Tech. Ideal para largas sesiones.' },
  { id:2, name:'Polo Crema Classic Stretch',  sport:'golf',  price:14990, img:'img/Golf/02_polo_crema.jpg', sizes:['S','M','L','XL'], desc:'Tejido elástico 4 direcciones. UV+50.' },
  { id:3, name:'Conjunto Polo y Pantalón', sport:'equitacion', price:38900, badge:'NUEVO', img:'img/Equitacion/01_conjunto_polo_pantalon.jpg', sizes:['S','M','L','XL'], desc:'Conjunto ecuestre completo.' },
  { id:4, name:'Malla Entera Competencia', sport:'natacion', price:18500, img:'img/Natacion/prenda_01.jpg', sizes:['32','34','36','38','40'], desc:'Tejido Chlorine-Resist.' },
  { id:5, name:'Camiseta de Juego Hockey',  sport:'hockey',  price:15990, badge:'NUEVO', img:'img/Hockey/prenda_1.jpg', sizes:['S','M','L','XL'], desc:'Tejido DryTech reforzado.' },
  { id:6, name:'Remera Manga Larga Lycra',  sport:'remo',    price:13500, img:'img/Remo/prenda_01.jpg', sizes:['S','M','L','XL'], desc:'Lycra con UV+50.' },
];

/* ══════════════════════════════════════════
   INICIO
══════════════════════════════════════════ */
(async () => {
  // Restaurar sesión si ya estaba logueado
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    state.session = data.session;
    state.user    = await cargarPerfil(data.session.user);
    updateAuthUI();
  }

  // Escuchar cambios de auth
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') { state.user=null; state.session=null; updateAuthUI(); }
    if (event === 'SIGNED_IN' && session) {
      state.session = session;
      state.user    = await cargarPerfil(session.user);
      updateAuthUI();
    }
  });

  updateCartBadge();
  renderCart();
  await cargarProductos();
  await manejarRetornoPago();
})();
