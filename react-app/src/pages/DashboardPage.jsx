import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { API_BASE_URL } from '../api.js';

const DataContext = createContext(null);
const NAV = [
  ['inicio', 'home', 'Inicio'], ['buscar', 'search', 'Buscar objetos'], ['publicar', 'plus', 'Publicar objeto'],
  ['solicitudes', 'arrows', 'Solicitudes'], ['chat', 'chat', 'Mensajes'], ['entregados', 'delivered', 'Entregados'], ['reportes', 'chart', 'Reportes'], ['perfil', 'profile', 'Mi perfil']
];
function NavIcon({ name }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5.5 9v11h13V9M9 20v-6h6v6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    plus: <><path d="M12 4v16M4 12h16" /></>,
    arrows: <><path d="M3 8h17l-4-4M21 16H4l4 4" /></>,
    chat: <><circle cx="12" cy="11" r="7.5" strokeDasharray="1.5 2.4" /><path d="M8 20h8" /></>,
    delivered: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" /><path d="m8 12 2.5 2.5L16 9" /></>,
    chart: <><path d="M4 20V11M10 20V5M16 20v-8M22 20H2" /></>,
    profile: <><circle cx="12" cy="7" r="3" /><path d="M6 21v-2a6 6 0 0 1 12 0v2M9 13l3-2 3 2" /></>
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const CATEGORIAS = ['Accesorios', 'Documentos', 'Electrónica', 'Identificación', 'Llaves', 'Ropa', 'Útiles', 'Otros'];

function useData() { return useContext(DataContext); }
function fullName(person) { return [person?.nombre, person?.apellido].filter(Boolean).join(' ') || person?.usuarioNombre || 'Usuario'; }
function initials(name) { return String(name || 'U').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase(); }
function messageReadKey(userId, conversationId) { return `btmMensajesLeidos:${userId}:${conversationId}`; }
function badgeLabel(count) { return count > 9 ? '9+' : String(count); }
function countUnreadMessages(conversations, userId) {
  return conversations.reduce((total, conversation) => {
    const marker = localStorage.getItem(messageReadKey(userId, conversation.id));
    if (marker === null) return total;
    const messages = conversation.mensajes || [];
    const lastReadIndex = marker === '0' ? -1 : messages.findLastIndex(item => String(item.id) === marker);
    return total + messages.slice(lastReadIndex + 1).filter(item => String(item.autorId) !== String(userId)).length;
  }, 0);
}
function dateText(value) {
  if (!value) return 'Fecha no disponible';
  const prefix = String(value instanceof Date ? value.toISOString() : value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = prefix ? new Date(Number(prefix[1]), Number(prefix[2]) - 1, Number(prefix[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium' }).format(date);
}
function notify(message, kind = 'success') {
  if (window.Swal?.fire) window.Swal.fire({ toast: true, position: 'top-end', icon: kind, title: message, showConfirmButton: false, timer: 2600, timerProgressBar: true });
  else window.dispatchEvent(new CustomEvent('btm:toast', { detail: { message, kind } }));
}
async function confirmAction(title, text = 'Esta acción no se puede deshacer.') {
  if (window.Swal?.fire) {
    const result = await window.Swal.fire({ title, text, icon: 'warning', showCancelButton: true, confirmButtonText: 'Continuar', cancelButtonText: 'Cancelar', reverseButtons: true });
    return result.isConfirmed;
  }
  return new Promise(resolve => window.dispatchEvent(new CustomEvent('btm:dialog', { detail: { type: 'confirm', title, text, resolve } })));
}
async function requestMessage() {
  if (window.Swal?.fire) {
    const result = await window.Swal.fire({ title: 'Enviar solicitud', input: 'textarea', inputLabel: 'Mensaje opcional', inputPlaceholder: 'Cuéntale a la persona por qué te interesa este objeto.', inputAttributes: { maxlength: 2000 }, showCancelButton: true, confirmButtonText: 'Enviar solicitud', cancelButtonText: 'Cancelar' });
    return result.isConfirmed ? result.value || '' : null;
  }
  return new Promise(resolve => window.dispatchEvent(new CustomEvent('btm:dialog', { detail: { type: 'input', title: 'Enviar solicitud', text: 'Cuéntale a la persona por qué te interesa este objeto.', resolve } })));
}

export default function DashboardPage() {
  const session = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('sesionActual') || 'null'); } catch { return null; }
  }, []);
  const navigate = useNavigate();
  const [data, setData] = useState({ objetos: [], entregados: [], solicitudes: [], conversaciones: [], usuarios: [] });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const api = useCallback(async (path, options = {}) => {
    const token = session?.apiToken;
    if (!token) throw new Error('La sesión terminó. Inicia sesión nuevamente.');
    const response = await fetch(`${session.apiBaseUrl || API_BASE_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem('sesionActual');
      navigate('/login', { replace: true });
      throw new Error(result.mensaje || 'La sesión venció. Inicia sesión nuevamente.');
    }
    if (!response.ok) throw new Error(result.mensaje || 'No se pudo completar la operación.');
    return result;
  }, [session, navigate]);

  const refresh = useCallback(async () => {
    const next = await api('/api/data');
    setData({ objetos: next.objetos || [], entregados: next.entregados || [], solicitudes: next.solicitudes || [], conversaciones: next.conversaciones || [], usuarios: next.usuarios || [] });
    setError('');
    return next;
  }, [api]);

  useEffect(() => {
    if (!session?.apiToken) return;
    let alive = true;
    setBusy(true);
    api('/api/data').then(next => {
      if (alive) setData({ objetos: next.objetos || [], entregados: next.entregados || [], solicitudes: next.solicitudes || [], conversaciones: next.conversaciones || [], usuarios: next.usuarios || [] });
    }).catch(reason => { if (alive) setError(reason.message); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [api, session?.apiToken, revision]);

  useEffect(() => {
    if (!session?.apiToken) return undefined;
    const timer = window.setInterval(() => {
      api('/api/data').then(next => setData({ objetos: next.objetos || [], entregados: next.entregados || [], solicitudes: next.solicitudes || [], conversaciones: next.conversaciones || [], usuarios: next.usuarios || [] })).catch(() => {});
    }, 10000);
    return () => window.clearInterval(timer);
  }, [api, session?.apiToken]);

  if (!session?.apiToken) return <Navigate to="/login" replace />;
  const value = { session, data, api, refresh, busy, error, setError, reload: () => setRevision(value => value + 1) };
  return (
    <DataContext.Provider value={value}>
      <Routes>
        <Route element={<AppFrame />}>
          <Route index element={<HomePage />} />
          <Route path="buscar" element={<BrowsePage />} />
          <Route path="publicar" element={<PublishPage />} />
          <Route path="solicitudes" element={<RequestsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="entregados" element={<DeliveredPage />} />
          <Route path="reportes" element={<ReportsPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
      </Routes>
    </DataContext.Provider>
  );
}

function AppFrame() {
  const { session, data, api, reload, busy } = useData();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogValue, setDialogValue] = useState('');
  const [readRevision, setReadRevision] = useState(0);
  const readBaselineReady = useRef(false);
  useEffect(() => {
    const showToast = event => { setToast(event.detail); window.setTimeout(() => setToast(null), 3000); };
    const showDialog = event => { setDialog(event.detail); setDialogValue(''); };
    window.addEventListener('btm:toast', showToast);
    window.addEventListener('btm:dialog', showDialog);
    return () => { window.removeEventListener('btm:toast', showToast); window.removeEventListener('btm:dialog', showDialog); };
  }, []);
  useEffect(() => {
    const updateReadState = () => setReadRevision(value => value + 1);
    window.addEventListener('btm:messages-read', updateReadState);
    window.addEventListener('storage', updateReadState);
    return () => { window.removeEventListener('btm:messages-read', updateReadState); window.removeEventListener('storage', updateReadState); };
  }, []);
  useEffect(() => {
    if (busy) return;
    data.conversaciones.forEach(conversation => {
      const key = messageReadKey(session.id, conversation.id);
      if (localStorage.getItem(key) !== null) return;
      const latest = conversation.mensajes?.at(-1);
      const marker = readBaselineReady.current ? '0' : String(latest?.id ?? '0');
      localStorage.setItem(key, marker);
    });
    readBaselineReady.current = true;
    window.dispatchEvent(new Event('btm:messages-read'));
  }, [busy, data.conversaciones, session.id]);
  function finishDialog(value) { dialog?.resolve(value); setDialog(null); setDialogValue(''); }
  const pending = data.solicitudes.filter(item => String(item.propietarioId) === String(session.id) && item.estado === 'Pendiente').length;
  const unreadMessages = useMemo(() => countUnreadMessages(data.conversaciones, session.id), [data.conversaciones, session.id, readRevision]);
  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* A local logout still closes the current browser session. */ }
    localStorage.removeItem('sesionActual');
    localStorage.removeItem('btmConversacionActiva');
    navigate('/login', { replace: true });
  }
  return (
    <div className="app-shell">
      <aside className="side-nav">
        <Link className="brand" to="/app"><img className="udb-logo" src="/imagenes.img/logo-udb.png" alt="Universidad Don Bosco" /><span className="brand-word">Back<span>To</span>Me</span></Link>
        <nav aria-label="Navegación principal">
          {NAV.map(([key, icon, label]) => <NavLink key={key} end={key === 'inicio'} to={key === 'inicio' ? '/app' : `/app/${key}`} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><span><NavIcon name={icon} /></span>{label}{key === 'solicitudes' && pending > 0 && <b className="nav-badge">{badgeLabel(pending)}</b>}{key === 'chat' && unreadMessages > 0 && <b className="nav-badge">{badgeLabel(unreadMessages)}</b>}</NavLink>)}
        </nav>
        <button className="side-account" type="button" onClick={() => navigate('/app/perfil')}><span className="mini-avatar">{initials(fullName(session))}</span><span><strong>{fullName(session)}</strong><small>{session.carrera || 'Comunidad UDB'}</small></span><span className="logout-mark">›</span></button>
        <button className="button secondary logout-button" onClick={logout}>Cerrar sesión</button>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Link className="brand mobile-brand" to="/app"><img className="udb-logo" src="/imagenes.img/logo-udb.png" alt="" /><span className="brand-word">Back<span>To</span>Me</span></Link>
          <div className="top-actions"><button className="search-pill" type="button" onClick={() => navigate('/app/buscar')}><span>⌕</span><small>Buscar un objeto</small></button><button className="round-action" type="button" aria-label="Actualizar información" title="Actualizar" onClick={reload}>↻</button><button className="mini-avatar top-avatar" type="button" onClick={() => navigate('/app/perfil')} aria-label="Abrir perfil">{initials(fullName(session))}</button><ThemeToggle /></div>
        </header>
        <main className="page-content"><Outlet /></main>
        <nav className="mobile-nav" aria-label="Navegación móvil">{NAV.map(([key, icon, label]) => <NavLink key={key} end={key === 'inicio'} to={key === 'inicio' ? '/app' : `/app/${key}`} className={({ isActive }) => `mobile-link${isActive ? ' active' : ''}`}><span><NavIcon name={icon} /></span>{key === 'solicitudes' && pending > 0 && <b className="nav-badge">{badgeLabel(pending)}</b>}{key === 'chat' && unreadMessages > 0 && <b className="nav-badge">{badgeLabel(unreadMessages)}</b>}<small>{label}</small></NavLink>)}</nav>
      </div>
      {toast && <div className={`btm-toast ${toast.kind === 'error' ? 'error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.message}</div>}
      {dialog && <div className="btm-dialog-backdrop" role="presentation"><section className="btm-dialog panel" role="dialog" aria-modal="true" aria-labelledby="btm-dialog-title"><h2 id="btm-dialog-title">{dialog.title}</h2><p>{dialog.text}</p>{dialog.type === 'input' && <textarea autoFocus maxLength={2000} value={dialogValue} onChange={event => setDialogValue(event.target.value)} placeholder="Mensaje opcional" />}<div className="form-actions"><button className="button secondary" type="button" onClick={() => finishDialog(dialog.type === 'input' ? null : false)}>Cancelar</button><button className="button primary" type="button" onClick={() => finishDialog(dialog.type === 'input' ? dialogValue : true)}>{dialog.type === 'input' ? 'Enviar solicitud' : 'Continuar'}</button></div></section></div>}
    </div>
  );
}

function PageHeading({ eyebrow = 'BACKTOME · COMUNIDAD UDB', title, description, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}
function ErrorNotice() { const { error, setError } = useData(); return error ? <div className="app-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Cerrar aviso">×</button></div> : null; }
function EmptyState({ title, children, action }) { return <div className="empty-state"><strong>{title}</strong><p>{children}</p>{action}</div>; }
function ObjectCard({ item, compact = false }) {
  const { session, api, refresh, data } = useData();
  const [working, setWorking] = useState(false);
  const mine = String(item.usuarioId) === String(session.id);
  const reviewCount = data.entregados.reduce((count, delivered) => String(delivered.usuarioId) === String(item.usuarioId) ? count + delivered.resenas.length : count, 0);
  async function request() {
    const message = await requestMessage();
    if (message === null) return;
    setWorking(true);
    try { const result = await api('/api/requests', { method: 'POST', body: JSON.stringify({ objetoId: item.id, mensaje: message }) }); await refresh(); notify(result.mensaje || 'Solicitud enviada.'); }
    catch (error) { notify(error.message, 'error'); } finally { setWorking(false); }
  }
  return <article className={`object-card panel${compact ? ' compact' : ''}`}>
    {item.foto ? <img className="object-card-photo" src={item.foto} alt={`Fotografía de ${item.nombre}`} loading="lazy" /> : <div className={`object-photo ${item.estado === 'Encontrado' ? 'photo-found' : ''}`} aria-label="Sin fotografía">{item.estado === 'Encontrado' ? '✓' : '⌕'}</div>}
    <div className="object-card-content"><div className="object-card-tags"><span className={`object-tag ${item.estado === 'Encontrado' ? 'found' : 'lost'}`}>{item.estado}</span><span className="object-tag neutral">{item.categoria}</span></div><h3>{item.nombre}</h3><p>{item.descripcion}</p><div className="object-meta"><span>⌖ {item.ubicacion}</span><span>{dateText(item.fecha)}</span></div><div className="object-owner">Publicado por <strong>{mine ? 'ti' : item.usuarioNombre || 'Comunidad UDB'}</strong>{reviewCount > 0 && <small className="publisher-reputation"> · {reviewCount} {reviewCount === 1 ? 'reseña de entrega' : 'reseñas de entrega'}</small>}</div>{!mine && <button className="button primary full" type="button" disabled={working} onClick={request}>{working ? 'Enviando…' : 'Contactar'}</button>}</div>
  </article>;
}
function HomePage() {
  const { data, busy, session } = useData(); const navigate = useNavigate();
  const [filter, setFilter] = useState('Todos');
  const objects = data.objetos.filter(item => filter === 'Todos' || item.estado === filter);
  const activity = data.solicitudes.filter(item => String(item.propietarioId) === String(session.id) || String(item.usuarioId) === String(session.id)).slice(0, 3);
  return <><ErrorNotice /><PageHeading eyebrow="COMUNIDAD UDB" title="Objetos de la comunidad" description="Encuentra lo que buscas o ayuda a alguien a recuperar lo suyo." action={<button className="button primary" onClick={() => navigate('/app/publicar')}>＋ Publicar objeto</button>} />
    <UdbServicesCarousel />
    <div className="feed-layout community-home-layout">
      <section aria-label="Publicaciones de la comunidad">
        <div className="filter-row" aria-label="Filtrar objetos">{['Todos', 'Perdido', 'Encontrado'].map(value => <button key={value} type="button" className={`filter${filter === value ? ' active' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'Todos' ? 'Todos' : value === 'Perdido' ? 'Perdidos' : 'Encontrados'}</button>)}</div>
        {busy ? <Loading /> : objects.length ? <div className="feed-list community-feed">{objects.map(item => <ObjectCard key={item.id} item={item} />)}</div> : <EmptyState title="Aún no hay publicaciones">Cuando alguien publique un objeto, aparecerá aquí.<br /><br /><button className="button primary" type="button" onClick={() => navigate('/app/publicar')}>Crear la primera publicación</button></EmptyState>}
      </section>
      <aside className="feed-sidebar">
        <section className="panel side-panel"><h2>Actividad para ti</h2>{activity.length ? activity.map(item => { const isOwner = String(item.propietarioId) === String(session.id); const person = isOwner ? item.usuarioNombre : item.propietarioNombre; const action = isOwner ? 'solicitó información sobre' : 'enviaste una solicitud por'; return <div className="activity-item" key={item.id}><span className="avatar">{initials(person)}</span><div><strong>{person || 'Usuario'}</strong> {action} {item.objetoNombre}<button className="text-button" type="button" onClick={() => navigate(item.estado === 'Pendiente' ? '/app/solicitudes' : '/app/chat')}>Ver detalle →</button></div></div>; }) : <p className="activity-empty">Tus solicitudes aparecerán aquí.</p>}</section>
        <section className="panel side-panel helper"><strong>¿Encontraste algo?</strong><p>Una foto y una ubicación pueden ayudar a que su dueño lo reconozca.</p><button className="text-button" type="button" onClick={() => navigate('/app/publicar')}>Reportar un objeto →</button></section>
      </aside>
    </div>
  </>;
}
function UdbServicesCarousel() {
  const carousel = useRef(null);
  const services = [
    ['learning', 'Aula Digital', 'Cursos y actividades académicas', 'https://www.udbvirtual.edu.sv/auladigital/login/index.php'],
    ['portal', 'Portal Web', 'Servicios académicos estudiantiles', 'https://admacad.udb.edu.sv/PortalWeb'],
    ['library', 'Biblioteca', 'Biblioteca Rafael Meza Ayau', 'https://biblio.udb.edu.sv/biblioteca/'],
    ['repository', 'Repositorio Digital', 'Investigaciones y trabajos UDB', 'https://rd.udb.edu.sv/'],
    ['virtual', 'UDB Virtual', 'Plataforma de formación virtual', 'https://www.udbvirtual.edu.sv/'],
    ['news', 'Publicaciones', 'Noticias y artículos de la UDB', 'https://www.udb.edu.sv/udb/publicaciones']
  ];
  const scroll = direction => carousel.current?.scrollBy({ left: direction * Math.max(230, carousel.current.clientWidth * 0.72), behavior: 'smooth' });
  return <section className="udb-shortcuts panel" aria-labelledby="udbShortcutsTitle">
    <div className="udb-shortcuts-heading"><div><span className="eyebrow">SERVICIOS PARA ESTUDIANTES</span><h2 id="udbShortcutsTitle">Accesos rápidos UDB</h2><p>Enlaces oficiales de la Universidad Don Bosco, reunidos en un solo lugar.</p></div>
      <div className="udb-carousel-controls" aria-label="Controles de accesos UDB"><button className="udb-carousel-button" type="button" aria-label="Ver servicios anteriores" onClick={() => scroll(-1)}>‹</button><button className="udb-carousel-button" type="button" aria-label="Ver más servicios" onClick={() => scroll(1)}>›</button></div>
    </div>
    <div ref={carousel} className="udb-service-carousel" aria-label="Carrusel de servicios UDB" tabIndex="0">{services.map(([icon, title, description, url]) => <a className="udb-service-card" key={title} href={url} target="_blank" rel="noopener noreferrer"><span className="udb-service-icon"><UdbServiceIcon type={icon} /></span><span className="udb-service-copy"><strong>{title}</strong><small>{description}</small></span><span className="udb-service-arrow" aria-hidden="true">↗</span></a>)}</div>
    <p className="udb-shortcuts-note">Los servicios se abren en el sitio oficial de la UDB.</p>
  </section>;
}
function UdbServiceIcon({ type }) {
  const shapes = {
    learning: <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 11v5c3 2 7 2 10 0v-5M21 9v6" /></>,
    portal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01M8 13h8M8 16h5" /></>,
    library: <><path d="M4 5.5c3-1.5 5.5-.6 8 1.2 2.5-1.8 5-2.7 8-1.2v13c-3-1.5-5.5-.7-8 1.2-2.5-1.9-5-2.7-8-1.2v-13Z" /><path d="M12 7v12" /></>,
    repository: <><path d="M5 4h14v16H5zM8 8h8M8 11h8M8 14h5" /><path d="M3 7v14h14" /></>,
    virtual: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M9 9l6 3-6 3V9Z" /></>,
    news: <><path d="M5 4h13a2 2 0 0 1 2 2v14H6a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z" /><path d="M7 8h9M7 12h9M7 16h6" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[type]}</svg>;
}
function Loading() { return <div className="panel loading-state" role="status">Cargando información…</div>; }
function BrowsePage() {
  const { data, busy } = useData();
  const [filters, setFilters] = useState({ query: '', type: 'Todos', category: 'Todas', location: '' });
  const update = event => setFilters(current => ({ ...current, [event.target.name]: event.target.value }));
  const results = data.objetos.filter(item => {
    const haystack = `${item.nombre} ${item.descripcion} ${item.categoria} ${item.ubicacion} ${item.usuarioNombre}`.toLocaleLowerCase('es');
    return (!filters.query || haystack.includes(filters.query.toLocaleLowerCase('es'))) && (filters.type === 'Todos' || item.estado === filters.type) && (filters.category === 'Todas' || item.categoria === filters.category) && (!filters.location || item.ubicacion.toLocaleLowerCase('es').includes(filters.location.toLocaleLowerCase('es')));
  });
  return <><ErrorNotice /><PageHeading title="Buscar objetos" description="Filtra los reportes de la comunidad para encontrar una pertenencia." />
    <section className="panel search-filters" aria-label="Filtros de búsqueda"><label className="wide">Buscar<input type="search" name="query" value={filters.query} onChange={update} placeholder="Ej. mochila, llaves, biblioteca" /></label><label>Tipo<select name="type" value={filters.type} onChange={update}><option>Todos</option><option>Perdido</option><option>Encontrado</option></select></label><label>Categoría<select name="category" value={filters.category} onChange={update}><option>Todas</option>{CATEGORIAS.map(item => <option key={item}>{item}</option>)}</select></label><label>Ubicación<input name="location" value={filters.location} onChange={update} placeholder="Ej. biblioteca" /></label><p className="result-count">{results.length} {results.length === 1 ? 'resultado' : 'resultados'}</p></section>
    {busy ? <Loading /> : results.length ? <div className="object-grid">{results.map(item => <ObjectCard key={item.id} item={item} />)}</div> : <EmptyState title="No encontramos coincidencias">Prueba cambiar las palabras o quitar alguno de los filtros.</EmptyState>}
  </>;
}
async function imageData(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una imagen válida.');
  const source = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('No se pudo leer la imagen.')); reader.readAsDataURL(file); });
  const img = new Image(); img.src = source;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('El archivo de imagen no se puede abrir.')); });
  const scale = Math.min(1, 900 / Math.max(img.width, img.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); const output = canvas.toDataURL('image/jpeg', .72);
  if (output.length > 1750000) throw new Error('La imagen es muy pesada. Selecciona una más pequeña.');
  return output;
}
function PublishPage() {
  const { api, refresh, setError } = useData(); const navigate = useNavigate();
  const [form, setForm] = useState({ nombre: '', estado: 'Perdido', categoria: '', descripcion: '', ubicacion: '', fecha: new Date().toISOString().slice(0, 10) });
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(''); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const cameraInput = useRef(null); const galleryInput = useRef(null);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  function selectImage(event) {
    const picked = event.target.files?.[0] || null;
    if (picked) {
      setFile(picked);
      setPreview(URL.createObjectURL(picked));
    }
    event.target.value = '';
  }
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
  async function submit(event) {
    event.preventDefault(); setMessage(''); setError(''); setSaving(true);
    try { const foto = await imageData(file); await api('/api/objects', { method: 'POST', body: JSON.stringify({ ...form, foto }) }); await refresh(); notify('Publicación creada.'); navigate('/app'); }
    catch (reason) { setMessage(reason.message); } finally { setSaving(false); }
  }
  return <><ErrorNotice /><PageHeading title="Publicar un objeto" description="Comparte los detalles para que la comunidad UDB pueda ayudarte." />
    <form className="panel publish-form" onSubmit={submit}><div className="publish-grid"><label>Nombre del objeto<input name="nombre" value={form.nombre} maxLength="150" required onChange={update} placeholder="Ej. Audífonos negros" /></label><label>Tipo de reporte<select name="estado" value={form.estado} onChange={update}><option>Perdido</option><option>Encontrado</option></select></label><label>Categoría<select name="categoria" value={form.categoria} required onChange={update}><option value="">Selecciona una categoría</option>{CATEGORIAS.map(item => <option key={item}>{item}</option>)}</select></label><label>Fecha<input type="date" name="fecha" value={form.fecha} required onChange={update} /></label><label className="wide">Ubicación<input name="ubicacion" value={form.ubicacion} maxLength="200" required onChange={update} placeholder="Ej. edificio 4, segundo nivel" /></label><label className="wide">Descripción<textarea name="descripcion" value={form.descripcion} maxLength="5000" required rows="5" onChange={update} placeholder="Describe el objeto y cualquier detalle que ayude a identificarlo." /></label><div className="wide photo-picker"><span className="photo-picker-label">Fotografía (opcional)</span><input className="desktop-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} aria-label="Seleccionar fotografía del objeto" /><div className="mobile-photo-actions"><button type="button" className="button secondary" onClick={() => cameraInput.current?.click()}><span aria-hidden="true">📷</span> Cámara</button><button type="button" className="button secondary" onClick={() => galleryInput.current?.click()}><span aria-hidden="true">▧</span> Fotos</button><input ref={cameraInput} className="mobile-photo-input" type="file" accept="image/*" capture="environment" onChange={selectImage} tabIndex="-1" aria-hidden="true" /><input ref={galleryInput} className="mobile-photo-input" type="file" accept="image/*" onChange={selectImage} tabIndex="-1" aria-hidden="true" /></div><small>{file ? `Imagen seleccionada: ${file.name}` : 'La imagen se comprime antes de enviarse.'}</small>{preview && <img className="publish-preview" src={preview} alt="Vista previa del objeto" />}</div></div>{message && <p className="form-message error" role="alert">{message}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={() => navigate('/app')}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Publicando…' : 'Publicar objeto'}</button></div></form>
  </>;
}
function RequestsPage() {
  const { data, session, api, refresh } = useData(); const [tab, setTab] = useState('recibidas'); const [workingId, setWorkingId] = useState('');
  const received = data.solicitudes.filter(item => String(item.propietarioId) === String(session.id)); const sent = data.solicitudes.filter(item => String(item.usuarioId) === String(session.id)); const list = tab === 'recibidas' ? received : sent;
  async function reply(item, estado) { setWorkingId(String(item.id)); try { const result = await api(`/api/requests/${item.id}`, { method: 'PATCH', body: JSON.stringify({ estado }) }); await refresh(); notify(result.mensaje || 'Solicitud actualizada.'); } catch (error) { notify(error.message, 'error'); } finally { setWorkingId(''); } }
  return <><ErrorNotice /><PageHeading title="Solicitudes" description="Revisa los mensajes de quienes buscan o han encontrado un objeto." /><div className="filter-row" role="tablist"><button className={`filter${tab === 'recibidas' ? ' active' : ''}`} role="tab" aria-selected={tab === 'recibidas'} onClick={() => setTab('recibidas')}>Recibidas ({received.length})</button><button className={`filter${tab === 'enviadas' ? ' active' : ''}`} role="tab" aria-selected={tab === 'enviadas'} onClick={() => setTab('enviadas')}>Enviadas ({sent.length})</button></div>
    {!list.length ? <EmptyState title="No hay solicitudes en esta lista">Cuando alguien responda a una publicación, aparecerá aquí.</EmptyState> : <div className="request-list">{list.map(item => <RequestCard key={item.id} item={item} owner={tab === 'recibidas'} working={workingId === String(item.id)} onReply={reply} />)}</div>}
  </>;
}
function RequestCard({ item, owner, working, onReply }) {
  const navigate = useNavigate(); const stateClass = item.estado.toLowerCase();
  return <article className="panel request-card"><div className="request-card-head"><div><span className="eyebrow">{owner ? 'TE ESCRIBIÓ' : 'SOLICITASTE'}</span><h3>{item.objetoNombre}</h3></div><span className={`request-status ${stateClass}`}>{item.estado}</span></div><p>{item.mensaje || 'Sin mensaje adicional.'}</p><div className="object-meta"><span>{owner ? 'De' : 'Propietario'}: {owner ? item.usuarioNombre : item.propietarioNombre}</span><span>{dateText(item.fechaSolicitud)}</span></div><div className="form-actions">{owner && item.estado === 'Pendiente' && <><button className="button secondary" disabled={working} onClick={() => onReply(item, 'rechazada')}>Rechazar</button><button className="button primary" disabled={working} onClick={() => onReply(item, 'aceptada')}>{working ? 'Guardando…' : 'Aceptar solicitud'}</button></>}{item.estado === 'Aceptada' && <button className="button primary" onClick={() => navigate(`/app/chat?objeto=${item.objetoId}`)}>Abrir conversación</button>}</div></article>;
}
function ChatPage() {
  const { data, session, api, refresh, busy } = useData(); const [params] = useSearchParams(); const requestedObject = params.get('objeto'); const [selected, setSelected] = useState(''); const [message, setMessage] = useState(''); const [sending, setSending] = useState(false);
  const sorted = [...data.conversaciones].sort((a, b) => new Date(b.actualizada || 0) - new Date(a.actualizada || 0));
  const active = sorted.find(item => requestedObject && String(item.objetoId) === String(requestedObject)) || sorted.find(item => String(item.id) === String(selected)) || sorted[0];
  useEffect(() => { if (active && String(active.id) !== String(selected)) setSelected(String(active.id)); }, [active, selected]);
  const latestMessageId = active?.mensajes?.at(-1)?.id;
  useEffect(() => {
    if (!active) return;
    localStorage.setItem(messageReadKey(session.id, active.id), String(latestMessageId ?? '0'));
    window.dispatchEvent(new Event('btm:messages-read'));
  }, [active?.id, latestMessageId, session.id]);
  async function send(event) { event.preventDefault(); if (!active || !message.trim()) return; setSending(true); try { await api(`/api/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ texto: message.trim() }) }); setMessage(''); await refresh(); } catch (error) { notify(error.message, 'error'); } finally { setSending(false); } }
  const counterpart = active && (String(active.propietarioId) === String(session.id) ? active.solicitanteNombre : active.propietarioNombre);
  return <><ErrorNotice /><PageHeading title="Mensajes" description="Coordina la devolución de los objetos con otras personas." />
    <div className="panel chat-layout"><aside className="chat-list"><h2>Conversaciones</h2>{sorted.map(item => <button key={item.id} className={`chat-thread${String(item.id) === String(active?.id) ? ' active' : ''}`} onClick={() => setSelected(String(item.id))}><span className="mini-avatar">{initials(String(item.propietarioId) === String(session.id) ? item.solicitanteNombre : item.propietarioNombre)}</span><span><strong>{String(item.propietarioId) === String(session.id) ? item.solicitanteNombre : item.propietarioNombre}</strong><small>{item.objetoNombre}</small><small>{item.mensajes?.at(-1)?.texto || 'Inicia la conversación'}</small></span></button>)}{!sorted.length && <p className="muted-note">Aún no tienes conversaciones. Envía una solicitud desde una publicación.</p>}</aside>
      <section className="chat-window" aria-label="Conversación"><div className="chat-window-head">{active ? <><strong>{counterpart}</strong><small>{active.objetoNombre}</small></> : <strong>Selecciona una conversación</strong>}</div>{active ? <><div className="chat-messages" aria-live="polite">{(active.mensajes || []).map(item => <div key={item.id} className={`chat-bubble${String(item.autorId) === String(session.id) ? ' mine' : ''}`}><small>{item.autorNombre} · {dateText(item.fecha)}</small><p>{item.texto}</p></div>)}{!active.mensajes?.length && <p className="muted-note">Saluda y coordina un lugar seguro para la entrega.</p>}</div><form className="chat-compose" onSubmit={send}><input value={message} maxLength="500" onChange={event => setMessage(event.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" /><button className="button primary" disabled={sending || !message.trim()}>{sending ? 'Enviando…' : 'Enviar'}</button></form></> : busy ? <Loading /> : <div className="chat-empty">Tus conversaciones estarán aquí.</div>}</section>
    </div>
  </>;
}
function DeliveredPage() {
  const { data, busy, session } = useData();
  return <><ErrorNotice /><PageHeading title="Objetos entregados" description="Revisa los objetos que la comunidad ya devolvió y las experiencias de quienes participaron." />
    {busy ? <Loading /> : data.entregados.length ? <div className="delivered-list">{data.entregados.map(item => <DeliveredCard key={item.id} item={item} session={session} />)}</div> : <EmptyState title="Aún no hay objetos entregados">Cuando una persona devuelva un objeto, aparecerá aquí.</EmptyState>}
  </>;
}
function DeliveredCard({ item, session }) {
  const { api, refresh } = useData();
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const myReview = item.resenas.find(review => String(review.autorId) === String(session.id));
  async function submitReview(event) {
    event.preventDefault();
    if (comment.trim().length < 5) return notify('Escribe una reseña de al menos 5 caracteres.', 'error');
    setSaving(true);
    try {
      const result = await api(`/api/objects/${item.id}/reviews`, { method: 'POST', body: JSON.stringify({ comentario: comment.trim() }) });
      setComment('');
      await refresh();
      notify(result.mensaje || 'Reseña publicada.');
    } catch (error) { notify(error.message, 'error'); } finally { setSaving(false); }
  }
  return <article className="panel delivered-card">
    {item.foto ? <img className="delivered-photo" src={item.foto} alt={`Fotografía de ${item.nombre}`} loading="lazy" /> : <div className="delivered-photo-placeholder" aria-hidden="true">✓</div>}
    <div className="delivered-content"><div className="object-card-tags"><span className="object-tag delivered-tag">Entregado</span><span className="object-tag neutral">{item.categoria}</span></div>
      <h2>{item.nombre}</h2><p>{item.descripcion}</p><div className="object-meta"><span>⌖ {item.ubicacion}</span><span>Publicado {dateText(item.fecha)}</span></div>
      <p className="delivered-by">Devuelto por <strong>{item.usuarioNombre || 'Comunidad UDB'}</strong></p>
      <section className="delivered-reviews" aria-label={`Reseñas de ${item.nombre}`}><h3>Reseñas de la entrega</h3>
        {item.resenas.length ? item.resenas.map(review => <blockquote className="delivery-review" key={review.id}><p>“{review.comentario}”</p><footer>{review.autorNombre} · {dateText(review.fecha)}</footer></blockquote>) : <p className="muted-note">Aún no hay reseñas para esta entrega.</p>}
      </section>
      {item.puedeResenar && !myReview && <form className="delivery-review-form" onSubmit={submitReview}><label htmlFor={`review-${item.id}`}>¿Recibiste este objeto? Cuéntale a la comunidad cómo fue.</label><textarea id={`review-${item.id}`} value={comment} maxLength="500" rows="3" onChange={event => setComment(event.target.value)} placeholder="Escribe una reseña respetuosa…" required /><button className="button primary" disabled={saving || comment.trim().length < 5}>{saving ? 'Publicando…' : 'Publicar reseña'}</button></form>}
      {myReview && <p className="review-confirmation">Ya publicaste tu reseña para esta entrega.</p>}
    </div>
  </article>;
}
function ReportsPage() {
  const { data, busy } = useData(); const [period, setPeriod] = useState('all'); const days = period === 'all' ? null : Number(period); const cutoff = days ? Date.now() - days * 86400000 : null;
  const filtered = data.objetos.filter(item => { if (!cutoff) return true; const date = new Date(item.fechaRegistro || item.fecha).getTime(); return Number.isFinite(date) && date >= cutoff; });
  const categories = [...new Set(filtered.map(item => item.categoria || 'Otros'))].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 10);
  const values = categories.map(category => ({ category, lost: filtered.filter(item => (item.categoria || 'Otros') === category && item.estado === 'Perdido').length, found: filtered.filter(item => (item.categoria || 'Otros') === category && item.estado === 'Encontrado').length }));
  const maximum = Math.max(1, ...values.map(item => item.lost + item.found)); const totalLost = filtered.filter(item => item.estado === 'Perdido').length; const totalFound = filtered.filter(item => item.estado === 'Encontrado').length;
  return <><ErrorNotice /><PageHeading title="Reportes de objetos" description="Actividad de los reportes activos de la comunidad." action={<label className="report-filter">Período<select value={period} onChange={event => setPeriod(event.target.value)}><option value="all">Todo el tiempo</option><option value="90">Últimos 90 días</option><option value="30">Últimos 30 días</option></select></label>} />
    <div className="report-summary"><article className="report-stat"><span>Publicaciones analizadas</span><strong>{filtered.length}</strong></article><article className="report-stat"><span>Objetos perdidos</span><strong>{totalLost}</strong></article><article className="report-stat"><span>Objetos encontrados</span><strong>{totalFound}</strong></article></div>
    <section className="panel report-chart-panel"><div><h2>Perdidos y encontrados por categoría</h2><p>La gráfica se actualiza con las publicaciones activas.</p></div>{busy ? <Loading /> : values.length ? <div className="bar-chart" role="img" aria-label="Gráfica de barras: objetos perdidos y encontrados por categoría"><div className="chart-legend"><span><i className="lost-dot" /> Perdidos</span><span><i className="found-dot" /> Encontrados</span></div><div className="chart-plot"><div className="chart-y-labels">{[maximum, Math.ceil(maximum / 2), 0].map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}</div><div className="chart-plot-area"><div className="chart-grid-lines"><i /><i /><i /></div><div className="chart-columns">{values.map(item => <div className="chart-column" key={item.category} title={`${item.category}: ${item.lost} perdidos y ${item.found} encontrados`}><div className="bar-stack" style={{ height: `${Math.max(3, (item.lost + item.found) / maximum * 100)}%` }}><i className="bar-lost" style={{ flex: item.lost || 0.0001 }} /><i className="bar-found" style={{ flex: item.found || 0.0001 }} /></div></div>)}</div></div></div><div className="chart-labels">{values.map(item => <span key={item.category}>{item.category}</span>)}</div></div> : <EmptyState title="Todavía no hay datos para graficar">Publica un objeto para que se refleje en los reportes.</EmptyState>}</section>
    <p className="muted-note">El gráfico representa conteos por categoría; las barras distinguen reportes perdidos y encontrados.</p>
  </>;
}
function ProfilePage() {
  const { session, data, api, refresh } = useData(); const navigate = useNavigate(); const [name, setName] = useState(session.nombre || ''); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const own = data.objetos.filter(item => String(item.usuarioId) === String(session.id));
  const ownDelivered = data.entregados.filter(item => String(item.usuarioId) === String(session.id));
  const publications = [...own, ...ownDelivered];
  const reviewsReceived = ownDelivered.reduce((count, item) => count + item.resenas.length, 0);
  async function saveName(event) { event.preventDefault(); setSaving(true); setError(''); try { const result = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ nombre: name.trim() }) }); const nextSession = { ...session, ...result.usuario, apiToken: session.apiToken, apiBaseUrl: session.apiBaseUrl, origenAutenticacion: 'api' }; localStorage.setItem('sesionActual', JSON.stringify(nextSession)); window.location.reload(); } catch (reason) { setError(reason.message); } finally { setSaving(false); } }
  async function updatePublication(item, values) { try { const result = await api(`/api/objects/${item.id}`, { method: 'PATCH', body: JSON.stringify(values) }); await refresh(); notify(result.mensaje || 'Publicación actualizada.'); return true; } catch (reason) { notify(reason.message, 'error'); return false; } }
  async function deletePublication(item) { if (!await confirmAction(`¿Eliminar “${item.nombre}”?`, 'La publicación dejará de aparecer para la comunidad.')) return; try { await api(`/api/objects/${item.id}`, { method: 'DELETE' }); await refresh(); notify('Publicación eliminada.'); } catch (reason) { notify(reason.message, 'error'); } }
  async function logout() { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* El cierre local sigue disponible si la API no responde. */ } localStorage.removeItem('sesionActual'); navigate('/login', { replace: true }); }
  return <><ErrorNotice /><PageHeading title="Mi perfil" description="Administra tu información y tus publicaciones." /><section className="panel profile-card"><div className="avatar profile-avatar">{initials(fullName(session))}</div><div className="profile-details"><h2>{fullName(session)}</h2><p>{session.correo}</p><p>{session.carnet} · {session.carrera}</p><div className="profile-stats"><span><strong>{own.length}</strong> publicaciones activas</span><span><strong>{own.filter(item => item.estado === 'Encontrado').length}</strong> objetos encontrados</span><span><strong>{ownDelivered.length}</strong> entregados</span><span><strong>{reviewsReceived}</strong> reseñas recibidas</span></div></div></section>
    <section className="panel profile-edit"><h2>Nombre de perfil</h2><form className="inline-form" onSubmit={saveName}><label className="sr-only" htmlFor="profile-name">Nombre</label><input id="profile-name" value={name} maxLength="100" onChange={event => setName(event.target.value)} required /><button className="button primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar nombre'}</button></form>{error && <p role="alert" className="form-message error">{error}</p>}<button className="button secondary profile-logout" onClick={logout}>Cerrar sesión</button></section>
    <div className="page-heading section-heading"><div><span className="eyebrow">TUS REPORTES</span><h2>Mis publicaciones</h2></div></div>{publications.length ? <div className="own-posts">{publications.map(item => <OwnPost key={item.id} item={item} onUpdate={updatePublication} onDelete={deletePublication} />)}</div> : <EmptyState title="Aún no tienes publicaciones">Tus reportes aparecerán aquí cuando publiques un objeto.</EmptyState>}
  </>;
}
function OwnPost({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const delivered = item.estadoPublicacion === 'entregado';
  return <article className="panel object-card own-publication-card">
    {item.foto ? <img className="object-card-photo" src={item.foto} alt={`Fotografía de ${item.nombre}`} loading="lazy" /> : <div className={`object-photo ${item.estado === 'Encontrado' ? 'photo-found' : ''}`} aria-label="Sin fotografía">{item.estado === 'Encontrado' ? '✓' : '⌕'}</div>}
    <div className="object-card-content"><div className="object-card-tags"><span className={`object-tag ${delivered ? 'delivered-tag' : item.estado === 'Encontrado' ? 'found' : 'lost'}`}>{delivered ? 'Entregado' : item.estado}</span><span className="object-tag neutral">{item.categoria}</span></div>
      <h3>{item.nombre}</h3><p>{item.descripcion}</p><div className="object-meta"><span>⌖ {item.ubicacion}</span><span>{dateText(item.fecha)}</span></div>
      {delivered && item.resenas?.length > 0 && <small className="publisher-reputation">{item.resenas.length} {item.resenas.length === 1 ? 'reseña de entrega' : 'reseñas de entrega'}</small>}
      <div className="own-publication-actions"><button type="button" className="button danger" onClick={() => onDelete(item)}>Eliminar publicación</button><button type="button" className="button secondary" onClick={() => setEditing(open => !open)}>{editing ? 'Cerrar edición' : 'Editar publicación'}</button></div>
      {editing && <EditPublicationForm item={item} onCancel={() => setEditing(false)} onSave={async values => { const saved = await onUpdate(item, values); if (saved) setEditing(false); }} />}
    </div>
  </article>;
}
function EditPublicationForm({ item, onCancel, onSave }) {
  const [form, setForm] = useState({ nombre: item.nombre, estado: item.estadoPublicacion === 'entregado' ? 'Entregado' : item.estado, categoria: item.categoria, descripcion: item.descripcion, ubicacion: item.ubicacion, fecha: String(item.fecha || '').slice(0, 10) });
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(item.foto || ''); const [removePhoto, setRemovePhoto] = useState(false); const [saving, setSaving] = useState(false);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
  async function submit(event) {
    event.preventDefault(); setSaving(true);
    try { const foto = file ? await imageData(file) : removePhoto ? '' : item.foto || ''; await onSave({ ...form, foto }); }
    finally { setSaving(false); }
  }
  return <form className="edit-publication-form" onSubmit={submit}>
    <h4>Editar publicación</h4>
    <label>Nombre del objeto<input name="nombre" value={form.nombre} maxLength="150" required onChange={update} /></label>
    <label>Tipo de reporte<select name="estado" value={form.estado} onChange={update}><option value="Perdido">Perdido (aparecerá en Inicio)</option><option value="Encontrado">Encontrado (aparecerá en Inicio)</option><option value="Entregado" disabled={form.estado === 'Perdido'}>Entregado (aparecerá en Entregados)</option></select><small>Para marcarlo como entregado, primero elige “Encontrado”.</small></label>
    <label>Categoría<select name="categoria" value={form.categoria} required onChange={update}>{CATEGORIAS.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Fecha<input type="date" name="fecha" value={form.fecha} required onChange={update} /></label>
    <label className="edit-wide">Ubicación<input name="ubicacion" value={form.ubicacion} maxLength="200" required onChange={update} /></label>
    <label className="edit-wide">Descripción<textarea name="descripcion" value={form.descripcion} maxLength="5000" rows="4" required onChange={update} /></label>
    <div className="edit-wide edit-photo"><label htmlFor={`photo-${item.id}`}>Fotografía</label><input id={`photo-${item.id}`} type="file" accept="image/*" onChange={event => { const picked = event.target.files?.[0] || null; setFile(picked); setRemovePhoto(false); setPreview(picked ? URL.createObjectURL(picked) : item.foto || ''); }} />{preview && <img src={preview} alt="Vista previa de la fotografía" />}{preview && <button type="button" className="button secondary" onClick={() => { setFile(null); setRemovePhoto(true); setPreview(''); }}>Quitar fotografía</button>}<small>En celular, el selector permite elegir una foto o tomar una nueva.</small></div>
    <div className="edit-wide form-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
  </form>;
}
