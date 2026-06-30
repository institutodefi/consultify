import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { ROL_LABEL, can } from '../lib/permisos.js';

export default function Shell({ children }) {
  const { user, role, realRole, logout, demo, verEconomico } = useAuth();
  const navItem = ({ isActive }) =>
    isActive ? 'text-navy-900' : 'text-navy-900/75 hover:text-navy-700 transition';

  const esEquipo = can.esEquipo(role);
  const esCliente = role === 'cliente';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-[rgba(10,21,48,0.10)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-8">
            <a href="/" className="flex items-center">
              <img src="/logo.png" alt="Consultify" className="h-9 w-auto" />
            </a>
            <nav className="hidden gap-6 text-sm font-semibold md:flex">
              <a href="/" className="text-navy-900/75 transition hover:text-navy-700">Web</a>
              {/* La calculadora es económica: solo superadmin (o sin login, para captar leads) */}
              {(!user || verEconomico) && <NavLink to="/calculadora" className={navItem}>Calcula tu oferta</NavLink>}
              {user && esCliente && <NavLink to="/clientes" className={navItem}>Zona clientes</NavLink>}
              {user && esEquipo && <NavLink to="/consultores" className={navItem}>Zona interna</NavLink>}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {demo && <span className="chip bg-brand-orange/15 text-brand-orangeDark hidden sm:inline-flex">Modo demo</span>}
            {user ? (
              <>
                {/* Perfil: email + rol SIEMPRE visible (también en móvil) */}
                <div className="text-right">
                  <p className="hidden text-xs font-bold text-navy-900 leading-tight sm:block">{user.email}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-bold text-navy-700">
                    {ROL_LABEL[role] || role}
                    {realRole === 'superadmin' && role !== 'superadmin' && (
                      <span className="text-brand-orangeDark">· viendo como</span>
                    )}
                  </span>
                </div>
                {/* Avatar con inicial */}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-extrabold text-white" title={`${user.email} · ${ROL_LABEL[role] || role}`}>
                  {(user.email || '?').charAt(0).toUpperCase()}
                </span>
                <button onClick={logout} className="btn-ghost !px-4 !py-2">Salir</button>
              </>
            ) : (
              <Link to="/acceso" className="btn-primary !px-4 !py-2">Acceder</Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/10 bg-navy-900 py-8 text-center text-xs text-white/55">
        <img src="/logo_white.png" alt="" className="mx-auto mb-3 h-7 w-auto opacity-90" />
        <p>Consultify · Instituto de Excelencia Europea S.L. · CIF B87093076 · Madrid</p>
        <p className="mt-1">Precios sin IVA salvo indicación · <a href="/" className="transition hover:text-brand-orange">consultify.pro</a></p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
          <a href="/legal/aviso-legal.html" className="transition hover:text-brand-orange">Aviso legal</a>
          <a href="/legal/privacidad.html" className="transition hover:text-brand-orange">Privacidad</a>
          <a href="/legal/cookies.html" className="transition hover:text-brand-orange">Cookies</a>
          <a href="#" className="abrir-cookies transition hover:text-brand-orange">Configurar cookies</a>
        </p>
        <p className="mt-3 text-[11px] font-semibold italic text-brand-orange/90">Hecho con amor en Madrid por TuConsultor · Desde 2006 gestionando con el corazón</p>
      </footer>
    </div>
  );
}
