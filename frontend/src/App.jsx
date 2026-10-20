// Compone la tienda React: catálogo conectado a la API, detalle de producto y carrito local.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { getProducts } from './services/catalog.js';
import { useAuth } from './contexts/AuthContext.jsx';
import AuthDialog from './components/AuthDialog.jsx';
import CheckoutDialog from './components/CheckoutDialog.jsx';
import OrdersPanel from './components/OrdersPanel.jsx';
import { confirmPayment } from './services/orders.js';
import { EmployeesPage, InventoryPage, PosPage, ProtectedAdminPage, ProtectedStaffPage } from './pages/StaffPages.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';

const sports = ['all', 'tenis', 'golf', 'equitacion', 'natacion', 'remo', 'hockey'];
const sportLabels = { all: 'Todos', tenis: 'Tenis', golf: 'Golf', equitacion: 'Equitación', natacion: 'Natación', remo: 'Remo', hockey: 'Hockey' };
const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);

// Lee únicamente el carrito guardado; no se utiliza almacenamiento del navegador para autorizar acciones.
function readSavedCart() {
  try {
    const value = JSON.parse(localStorage.getItem('es_cart') || '[]');
    return Array.isArray(value) ? value.filter((item) => item && Number.isInteger(Number(item.id)) && typeof item.size === 'string' && Number.isInteger(item.qty) && item.qty >= 1 && item.qty <= 10 && Number.isFinite(Number(item.price))) : [];
  } catch {
    return [];
  }
}

function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [size, setSize] = useState('');
  const [cart, setCart] = useState(readSavedCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [authDialog, setAuthDialog] = useState({ open: false, mode: 'login' });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const paymentProcessed = useRef('');
  const auth = useAuth();

  // Supabase vuelve con type=recovery después de validar el enlace enviado al correo.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hash.get('type') === 'recovery') setAuthDialog({ open: true, mode: 'reset' });
  }, []);

  // Carga los productos reales desde la API. Si falla, informa el problema sin reemplazar los datos por ejemplos.
  useEffect(() => {
    let active = true;
    getProducts()
      .then((items) => { if (active) setProducts(items); })
      .catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Persiste el carrito por comodidad; el servidor deberá volver a validar precio y stock al confirmar un pedido.
  useEffect(() => { localStorage.setItem('es_cart', JSON.stringify(cart)); }, [cart]);

  // Procesa el retorno de Mercado Pago verificando el pago con la API, nunca con el parámetro de URL solamente.
  useEffect(() => {
    if (!auth.ready) return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('external_reference');
    if (!orderId || paymentProcessed.current === orderId) return;
    if (!auth.user) { setAuthDialog({ open: true, mode: 'login' }); return; }
    paymentProcessed.current = orderId;
    (async () => {
      try {
        const token = await auth.getAccessToken();
        const paymentId = params.get('payment_id');
        // La URL de retorno no demuestra el resultado: sin ID, el pedido queda pendiente.
        const result = paymentId
          ? await confirmPayment(token, orderId, paymentId)
          : { estado: 'pendiente', orderId };
        if (result.estado === 'cancelado') {
          try {
            const saved = JSON.parse(localStorage.getItem(`es_pending_cart_${orderId}`) || '[]');
            if (Array.isArray(saved) && saved.length) setCart(saved);
            localStorage.removeItem(`es_pending_cart_${orderId}`);
          } catch { localStorage.removeItem(`es_pending_cart_${orderId}`); }
        }
        if (result.estado === 'pagado') localStorage.removeItem(`es_pending_cart_${orderId}`);
        setNotice(result.estado === 'pagado' ? `Pedido #${orderId} confirmado.` : result.estado === 'cancelado' ? `El pedido #${orderId} fue cancelado; recuperamos los artículos de tu carrito.` : 'El pago continúa pendiente de acreditación.');
        if (result.estado === 'pagado' || result.estado === 'cancelado') {
          // Refresca existencias visibles luego de que la API confirme el resultado del pedido.
          getProducts().then(setProducts).catch(() => {});
        }
      } catch (error) {
        setNotice(error.message);
        paymentProcessed.current = '';
      } finally {
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();
  }, [auth.ready, auth.user]);

  const filtered = useMemo(() => products.filter((product) => {
    const matchesSport = filter === 'all' || product.sport === filter;
    const normalizedQuery = query.trim().toLocaleLowerCase('es');
    const matchesText = !normalizedQuery || `${product.name} ${product.desc || ''} ${product.sport}`.toLocaleLowerCase('es').includes(normalizedQuery);
    return matchesSport && matchesText;
  }), [products, filter, query]);

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  function openProduct(product) {
    setSelected(product);
    setSize(product.sizes?.find((item) => Number(product.stock?.[item] ?? 0) > 0) || '');
  }

  // Añade una variante identificada por producto y talle; el checkout vuelve a validar existencia en el backend.
  function addToCart(product, selectedSize) {
    if (!selectedSize) return;
    const available = Math.min(10, Number(product.stock?.[selectedSize]) || 0);
    if (available < 1) return;
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id && item.size === selectedSize);
      if (existing) return current.map((item) => item === existing ? { ...item, qty: Math.min(available, item.qty + 1) } : item);
      return [...current, { id: product.id, name: product.name, img: product.img, price: product.price, size: selectedSize, qty: 1 }];
    });
    setSelected(null);
    setNotice('Producto agregado al carrito');
    window.setTimeout(() => setNotice(''), 2200);
  }

  function updateQuantity(item, delta) {
    const product = products.find((entry) => entry.id === item.id);
    const available = Math.min(10, Number(product?.stock?.[item.size]) || 0);
    setCart((current) => current.map((line) => line.id === item.id && line.size === item.size
      ? { ...line, qty: Math.min(available || line.qty, Math.max(1, line.qty + delta)) }
      : line));
  }

  function removeFromCart(item) {
    setCart((current) => current.filter((line) => line.id !== item.id || line.size !== item.size));
  }

  const productCards = (items) => items.map((product) => (
    <article className="product-card" key={product.id} onClick={() => openProduct(product)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openProduct(product); }} role="button" tabIndex={0} aria-label={`Ver ${product.name}`}>
      <div className="product-img-wrap">
        <div className="product-img"><img src={product.img} alt={product.name} loading="lazy" decoding="async" /></div>
        {product.badge && <span className={`product-badge${product.badge.includes('%') || product.badge.includes('−') ? ' product-badge--sale' : ''}`}>{product.badge}</span>}
        <button className="quick-add" aria-label={`Elegir talle de ${product.name}`} onClick={(event) => { event.stopPropagation(); openProduct(product); }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
        </button>
      </div>
      <div className="product-info"><p className="product-sport">{sportLabels[product.sport] || product.sport}</p><h3 className="product-name">{product.name}</h3><p className="product-price">{money(product.price)}</p></div>
    </article>
  ));

  const catalogContent = (title = 'NOVEDADES') => (
    <section className="products-section" id="novedades">
      <div className="products-header"><div><h2 className="section-title">{title}</h2><p className="section-subtitle">Diseñadas para quienes no hacen concesiones</p></div><Link to="/catalogo" className="view-all">VER TODO →</Link></div>
      <div className="filter-bar" role="group" aria-label="Filtrar por deporte">{sports.map((sport) => <button className={`filter-btn ${filter === sport ? 'active' : ''}`} key={sport} onClick={() => setFilter(sport)}>{sportLabels[sport]}</button>)}</div>
      {loading && <div className="products-loading"><div className="spinner" /><p>Cargando catálogo…</p></div>}
      {!loading && loadError && <div className="products-loading" role="alert"><p>{loadError}</p><button className="btn btn-outline-dark" onClick={() => { setLoading(true); setLoadError(''); getProducts().then(setProducts).catch((error) => setLoadError(error.message)).finally(() => setLoading(false)); }}>REINTENTAR</button></div>}
      {!loading && !loadError && filtered.length === 0 && <p className="products-loading">No hay productos en esta categoría todavía.</p>}
      {!loading && !loadError && filtered.length > 0 && <div className="products-grid">{productCards(filtered)}</div>}
    </section>
  );

  const openSport = (sport) => {
    setFilter(sport);
    document.getElementById('novedades')?.scrollIntoView({ behavior: 'smooth' });
  };

  const closeAccountMenu = () => setAccountOpen(false);

  // Reconstruye las secciones comerciales con las clases, imágenes y jerarquía de la tienda original.
  return (
    <>
      {announcementVisible && <div className="announcement-bar" id="ann-bar"><span className="ann-arrow" aria-hidden="true">←</span><p>ENVÍOS GRATUITOS EN COMPRAS SUPERIORES A $50.000&nbsp; | &nbsp;DEVOLUCIONES SIN CARGO</p><span className="ann-arrow" aria-hidden="true">→</span><button className="ann-close" onClick={() => setAnnouncementVisible(false)} aria-label="Cerrar aviso">×</button></div>}
      <header className="header" id="header">
        <button className="hamburger" aria-label="Abrir menú" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><span /><span /><span /></button>
        <nav className="nav-left" aria-label="Navegación principal"><a href="/#deportes">DEPORTES</a><a href="/#colecciones">COLECCIONES</a><a href="/#novedades">NOVEDADES</a><a href="/#nosotros">NOSOTROS</a></nav>
        <Link className="logo" to="/">ÉLITE SPORT</Link>
        <div className="nav-right">
          <button className="nav-icon-btn" aria-label="Buscar productos" onClick={() => setSearchOpen(true)}><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg></button>
          <div className="account-menu-wrap">
            <button className="nav-icon-btn" aria-label={auth.user ? 'Abrir mi cuenta' : 'Iniciar sesión'} onClick={() => auth.user ? setAccountOpen((open) => !open) : setAuthDialog({ open: true, mode: 'login' })}><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg><span className="user-name-label">{auth.user?.user_metadata?.nombre || ''}</span></button>
            {accountOpen && auth.user && <div className="account-dropdown">
              <button onClick={() => { closeAccountMenu(); setOrdersOpen(true); }}>Mis pedidos</button>
              {['administrador', 'empleado'].includes(auth.role) && <><Link to="/inventario" onClick={closeAccountMenu}>Inventario</Link><Link to="/pos" onClick={closeAccountMenu}>Punto de venta</Link><Link to="/proyectos" onClick={closeAccountMenu}>Proyectos</Link></>}
              {auth.role === 'administrador' && <><Link to="/clientes" onClick={closeAccountMenu}>Clientes</Link><Link to="/empleados" onClick={closeAccountMenu}>Empleados</Link><Link to="/reportes" onClick={closeAccountMenu}>Reportes</Link></>}
              <button onClick={async () => { const { error } = await auth.signOut(); if (error) setNotice(error.message); else { closeAccountMenu(); setNotice('Sesión cerrada.'); } }}>Cerrar sesión</button>
            </div>}
          </div>
          <button className="nav-icon-btn cart-icon" onClick={() => setCartOpen(true)} aria-label={`Abrir carrito, ${cartCount} productos`}><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg><span className="cart-badge">{cartCount}</span></button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={
          <>
            <section className="hero" id="hero">
              <div className="hero-content"><p className="hero-eyebrow">COLECCIÓN OTOÑO / INVIERNO 2026</p><h1 className="hero-title">ELEGANCIA<br />EN CADA<br />MOVIMIENTO</h1><p className="hero-subtitle">Donde el estilo se encuentra con el rendimiento</p><div className="hero-actions"><a href="#novedades" className="btn btn-primary">VER COLECCIÓN</a><a href="#deportes" className="btn btn-outline-dark">EXPLORAR DEPORTES</a></div></div>
              <div className="hero-image"><div className="hero-img-placeholder"><img className="hero-main-image" src="/img/coll_mujer.jpg" alt="Jugadora de tenis en una cancha de polvo de ladrillo" /><a className="hero-sport-badge" href="#novedades">NUEVA TEMPORADA</a><div className="hero-deco-circle" /></div></div>
              <div className="hero-indicators"><span className="indicator active" /><span className="indicator" /><span className="indicator" /></div>
            </section>
            <section className="trust-badges">
              <div className="badge-item"><svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg><div><strong>Envío Gratis</strong><span>En compras desde $50.000</span></div></div>
              <div className="badge-item"><svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg><div><strong>Devoluciones</strong><span>14 días sin preguntas</span></div></div>
              <div className="badge-item"><svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg><div><strong>Calidad Premium</strong><span>Materiales certificados</span></div></div>
              <div className="badge-item"><svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16a2 2 0 0 1 .27.92z" /></svg><div><strong>Soporte 24/7</strong><span>Siempre a tu disposición</span></div></div>
            </section>
            <section className="sports-section" id="deportes"><div className="section-header"><h2 className="section-title">NUESTROS DEPORTES</h2><p className="section-subtitle">Equipamiento especializado para cada disciplina</p></div>
              <div className="sports-grid">{[
                ['tenis', 'RAQUETA', 'TENIS', 'Precisión y velocidad en cada golpe'], ['golf', 'CAMPO', 'GOLF', 'Elegancia y concentración'], ['equitacion', 'ECUESTRE', 'EQUITACIÓN', 'Tradición y sofisticación'], ['natacion', 'ACUÁTICO', 'NATACIÓN', 'Libertad en el agua'], ['remo', 'ACUÁTICO', 'REMO', 'Potencia y ritmo'], ['hockey', 'EQUIPO', 'HOCKEY', 'Velocidad y precisión'],
              ].map(([sport, tag, label, description]) => <button className="sport-card" data-sport={sport} key={sport} onClick={() => openSport(sport)} aria-label={`Explorar ${label}`}><div className="sport-card__img" style={{ backgroundImage: `url('/img/sports/${sport}.jpg')` }} /><div className="sport-card__overlay"><span className="sport-card__tag">{tag}</span><h3>{label}</h3><p>{description}</p><span className="sport-link">EXPLORAR →</span></div></button>)}</div>
            </section>
            <section className="collections-section" id="colecciones"><div className="section-header"><h2 className="section-title">COLECCIONES DESTACADAS</h2><p className="section-subtitle">Diseñadas para quienes no hacen concesiones</p></div>
              <div className="collections-grid">
                <article className="collection-card"><div className="collection-img"><img src="/img/Golf/05_vestido_polo_azul.jpg" alt="Vestido de la colección mujer" loading="lazy" /></div><div className="collection-info"><div><h3>MUJER</h3><p>Colección femenina</p></div><a href="#novedades" className="btn btn-sm">Ver todo</a></div></article>
                <article className="collection-card"><div className="collection-img"><img src="/img/Golf/04_conjunto_campera_pantalon.jpg" alt="Conjunto de la colección hombre" loading="lazy" /></div><div className="collection-info"><div><h3>HOMBRE</h3><p>Colección masculina</p></div><a href="#novedades" className="btn btn-sm">Ver todo</a></div></article>
                <article className="collection-card"><div className="collection-img"><img src="/img/Equitacion/08_casco_blanco.jpg" alt="Casco de equitación" loading="lazy" /></div><div className="collection-info"><div><h3>ACCESORIOS</h3><p>Completa tu look</p></div><a href="#novedades" className="btn btn-sm">Ver todo</a></div></article>
              </div>
            </section>
            {catalogContent()}
            <section className="brand-banner"><div className="brand-banner__content"><p className="brand-banner__eyebrow">NUESTRA FILOSOFÍA</p><h2>EL DEPORTE ES<br />UN ESTILO DE VIDA</h2><p className="brand-banner__text">En Élite Sport creemos que la ropa que usás debe estar a la altura de tu compromiso. Cada prenda es diseñada con materiales de primera calidad.</p><a href="#nosotros" className="btn btn-light">CONOCER MÁS</a></div></section>
            <section className="tech-section"><div className="section-header"><h2 className="section-title">TECNOLOGÍA EN CADA PRENDA</h2><p className="section-subtitle">Materiales de última generación para el máximo rendimiento</p></div><div className="tech-grid">{[
              // Mantiene los seis iconos SVG de línea que ya tenía la página original.
              ['DRY-TECH', 'Tejido de alta transpiración que evacúa la humedad', <><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>],
              ['FLEX-MOTION', 'Elasticidad cuádruple para libertad total de movimiento', <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />],
              ['ULTRA-LIGHT', 'Nuestras prendas son casi imperceptibles', <><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></>],
              ['SUN-GUARD', 'Protección UV+50 integrada en la tela', <><circle cx="12" cy="12" r="9" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3" /></>],
              ['ECO-FABRIC', 'Materiales reciclados y sostenibles', <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>],
              ['COMFORT-FIT', 'Costuras planas ergonómicas', <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />],
            ].map(([name, description, icon]) => <article className="tech-item" key={name}><div className="tech-icon"><svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.3" viewBox="0 0 24 24" aria-hidden="true">{icon}</svg></div><h4>{name}</h4><p>{description}</p></article>)}</div></section>
            <section className="membership-section"><div className="membership-card"><div className="membership-left"><div className="membership-card-visual"><p className="card-label">ÉLITE SPORT CLUB</p><p className="card-number">•••• •••• •••• 2026</p></div></div><div className="membership-right"><p className="membership-eyebrow">ÚNETE AL CLUB</p><h2>ÉLITE SPORT CLUB</h2><ul className="membership-benefits">{['5% de descuento en cada compra', 'Acceso anticipado a nuevas colecciones', 'Beneficios exclusivos y sorteos', 'Envío gratis en todos tus pedidos'].map((benefit) => <li key={benefit}><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>{benefit}</li>)}</ul><button className="btn btn-primary" onClick={() => setAuthDialog({ open: true, mode: auth.user ? 'login' : 'register' })}>HACERME SOCIO</button></div></div></section>
            <section className="about-section" id="nosotros"><div className="about-text"><p className="section-eyebrow">QUIÉNES SOMOS</p><h2 className="section-title">MÁS QUE UNA<br />TIENDA DE ROPA</h2><p>Somos una comunidad de atletas y apasionados del deporte. Desde 2010 vestimos a los mejores deportistas del país con indumentaria de calidad premium.</p><p>Trabajamos con marcas líderes del mundo y desarrollamos líneas propias diseñadas específicamente para cada disciplina deportiva.</p><button className="btn btn-primary" onClick={() => setNotice('Gracias por conocer Élite Sport.')}>NUESTRA HISTORIA</button></div><div className="about-stats"><div className="stat-item"><span className="stat-number">15+</span><span className="stat-label">Años de experiencia</span></div><div className="stat-item"><span className="stat-number">11</span><span className="stat-label">Deportes cubiertos</span></div><div className="stat-item"><span className="stat-number">500+</span><span className="stat-label">Productos disponibles</span></div><div className="stat-item"><span className="stat-number">50k+</span><span className="stat-label">Clientes satisfechos</span></div></div></section>
          </>
        } />
        <Route path="/catalogo" element={<>{catalogContent('CATÁLOGO DEPORTIVO')}</>} />
        <Route path="/inventario" element={<ProtectedStaffPage><InventoryPage /></ProtectedStaffPage>} />
        <Route path="/pos" element={<ProtectedStaffPage><PosPage /></ProtectedStaffPage>} />
        <Route path="/proyectos" element={<ProtectedStaffPage><ProjectsPage /></ProtectedStaffPage>} />
        <Route path="/empleados" element={<ProtectedAdminPage><EmployeesPage /></ProtectedAdminPage>} />
        <Route path="/reportes" element={<ProtectedAdminPage><ReportsPage /></ProtectedAdminPage>} />
        <Route path="/clientes" element={<ProtectedAdminPage><CustomersPage /></ProtectedAdminPage>} />
        <Route path="*" element={<main className="products-section"><h1 className="section-title">No encontramos esa página</h1><Link className="btn btn-primary" to="/">VOLVER A LA TIENDA</Link></main>} />
      </Routes>

      <footer className="footer"><div className="footer-top"><div className="footer-brand"><h3 className="footer-logo">ÉLITE SPORT</h3><p>Indumentaria deportiva premium para quienes viven el deporte con pasión y dedicación.</p><div className="social-links"><a href="#" aria-label="Instagram"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg></a><a href="#" aria-label="Facebook"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg></a><a href="#" aria-label="TikTok"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" /></svg></a></div></div><div className="footer-col"><h4>CATÁLOGO</h4><ul><li><a href="/#deportes">Tenis</a></li><li><a href="/#deportes">Golf</a></li><li><a href="/#deportes">Equitación</a></li><li><a href="/#deportes">Rugby</a></li><li><a href="/#deportes">Natación</a></li><li><a href="/#deportes">Remo</a></li></ul></div><div className="footer-col"><h4>MÁS DEPORTES</h4><ul><li><a href="/#deportes">Hockey</a></li><li><a href="/#deportes">Pádel</a></li><li><a href="/#deportes">Polo</a></li><li><a href="/#deportes">Pilates / Yoga</a></li><li><a href="/#deportes">Gimnasio</a></li></ul></div><div className="footer-col"><h4>AYUDA</h4><ul><li><button onClick={() => setAuthDialog({ open: true, mode: 'login' })}>Mi cuenta</button></li><li><button onClick={() => setOrdersOpen(true)}>Mis pedidos</button></li><li><a href="#">Guía de talles</a></li><li><a href="#">Envíos</a></li><li><a href="#">Devoluciones</a></li><li><a href="#">Contacto</a></li></ul></div><div className="footer-col"><h4>CONTACTO</h4><ul className="contact-list"><li><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16a2 2 0 0 1 .27.92z" /></svg> +54 11 4567-8900</li><li><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg> hola@elitesport.com.ar</li><li><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg> Av. del Libertador 1234, CABA</li></ul></div></div><div className="footer-bottom"><p>© 2026 Élite Sport. Todos los derechos reservados.</p><div className="footer-legal"><a href="#">Política de privacidad</a><a href="#">Términos y condiciones</a></div></div></footer>

      <div className={`search-panel ${searchOpen ? 'open' : ''}`} aria-hidden={!searchOpen}><div className="search-panel-inner"><input id="search-input" type="search" placeholder="Buscar productos, deportes..." value={query} onChange={(event) => setQuery(event.target.value)} autoFocus={searchOpen} /><button className="search-close" onClick={() => setSearchOpen(false)} aria-label="Cerrar búsqueda">×</button></div>{query.trim() && <div className="search-results">{filtered.slice(0, 6).map((product) => <button className="search-result-item" key={product.id} onClick={() => { setSearchOpen(false); openProduct(product); }}><span className="search-result-img"><img src={product.img} alt="" /></span><span className="search-result-name">{product.name}<small className="search-result-sport">{sportLabels[product.sport] || product.sport}</small></span><span className="search-result-price">{money(product.price)}</span></button>)}{filtered.length === 0 && <p className="search-no-results">No encontramos productos con esa búsqueda.</p>}</div>}</div>

      <div className={`overlay ${mobileMenuOpen ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)} />
      <aside className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`} aria-hidden={!mobileMenuOpen}><button className="panel-close" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menú">×</button><nav className="mobile-nav"><a className="mobile-nav-link" href="/#deportes" onClick={() => setMobileMenuOpen(false)}>Deportes</a><a className="mobile-nav-link" href="/#colecciones" onClick={() => setMobileMenuOpen(false)}>Colecciones</a><a className="mobile-nav-link" href="/#novedades" onClick={() => setMobileMenuOpen(false)}>Novedades</a><a className="mobile-nav-link" href="/#nosotros" onClick={() => setMobileMenuOpen(false)}>Nosotros</a><hr className="mobile-nav-divider" />{['administrador', 'empleado'].includes(auth.role) && <><Link className="mobile-nav-link" to="/inventario" onClick={() => setMobileMenuOpen(false)}>Inventario</Link><Link className="mobile-nav-link" to="/pos" onClick={() => setMobileMenuOpen(false)}>Punto de venta</Link><Link className="mobile-nav-link" to="/proyectos" onClick={() => setMobileMenuOpen(false)}>Proyectos</Link></>}{auth.role === 'administrador' && <><Link className="mobile-nav-link" to="/clientes" onClick={() => setMobileMenuOpen(false)}>Clientes</Link><Link className="mobile-nav-link" to="/empleados" onClick={() => setMobileMenuOpen(false)}>Empleados</Link><Link className="mobile-nav-link" to="/reportes" onClick={() => setMobileMenuOpen(false)}>Reportes</Link></>}</nav></aside>

      {selected && <div className="react-scrim" onClick={() => setSelected(null)}><section className="react-modal modal-product" role="dialog" aria-modal="true" aria-labelledby="selected-product-name" onClick={(event) => event.stopPropagation()}><button className="react-modal-close" onClick={() => setSelected(null)} aria-label="Cerrar">×</button><div className="product-modal-inner"><div className="product-modal-img"><img src={selected.img} alt={selected.name} /></div><div className="product-modal-info"><p className="product-modal-sport">{sportLabels[selected.sport] || selected.sport}</p><h2 className="product-modal-name" id="selected-product-name">{selected.name}</h2><p className="product-modal-desc">{selected.desc}</p><div className="product-modal-price-wrap"><strong className="product-modal-price">{money(selected.price)}</strong></div><fieldset className="react-sizes"><legend>Talle</legend>{(selected.sizes || []).map((item) => { const available = Number(selected.stock?.[item] ?? 0) > 0; return <button type="button" disabled={!available} aria-pressed={size === item} className={size === item ? 'selected' : ''} key={item} onClick={() => setSize(item)}>{item}</button>; })}</fieldset><button className="btn btn-primary btn-full" disabled={!size} onClick={() => addToCart(selected, size)}>AGREGAR AL CARRITO</button></div></div></section></div>}

      {cartOpen && <div className="react-scrim" onClick={() => setCartOpen(false)}><aside className="react-cart-panel" aria-label="Mi carrito" onClick={(event) => event.stopPropagation()}><div className="cart-header"><h2>Mi carrito ({cartCount})</h2><button className="panel-close" onClick={() => setCartOpen(false)} aria-label="Cerrar carrito">×</button></div>{cart.length === 0 ? <p className="cart-empty">Tu carrito está vacío.</p> : <><ul className="react-cart-lines">{cart.map((item) => <li key={`${item.id}-${item.size}`}><img src={item.img} alt="" /><div><strong>{item.name}</strong><small>Talle {item.size} · {money(item.price)}</small><div className="qty-control"><button className="qty-btn" onClick={() => updateQuantity(item, -1)} aria-label="Restar">−</button><span>{item.qty}</span><button className="qty-btn" onClick={() => updateQuantity(item, 1)} aria-label="Sumar">+</button><button className="react-remove" onClick={() => removeFromCart(item)}>Quitar</button></div></div></li>)}</ul><div className="react-cart-total"><span>Subtotal</span><strong>{money(cartTotal)}</strong><small>El precio definitivo y la disponibilidad se confirman con el servidor.</small></div><button className="btn btn-primary btn-full" onClick={() => { setCartOpen(false); if (!auth.user) setAuthDialog({ open: true, mode: 'login' }); else setCheckoutOpen(true); }}>CONTINUAR COMPRA</button></>}</aside></div>}
      <AuthDialog open={authDialog.open} initialMode={authDialog.mode} onClose={() => setAuthDialog((current) => ({ ...current, open: false }))} />
      <CheckoutDialog cart={cart} open={checkoutOpen} onClose={() => setCheckoutOpen(false)} onPaymentCreated={(result) => { localStorage.setItem(`es_pending_cart_${result.orderId}`, JSON.stringify(cart)); setCart([]); window.location.assign(result.init_point); }} />
      <OrdersPanel open={ordersOpen} onClose={() => setOrdersOpen(false)} />
      {notice && <div className="toast react-toast" role="status">{notice}</div>}
    </>
  );
}

export default App;
