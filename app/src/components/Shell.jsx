import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Shell({ children }) {
  const { user, role, logout, demo } = useAuth();
  const navItem = ({ isActive }) =>
    isActive ? 'text-navy-900' : 'text-navy-900/75 hover:text-navy-700 transition';
  return (
    <div className="min-h-screen flex flex-col">
      {/* Cabecera espejo de la landing: logo 36px, enlaces al 75%, botones píldora */}
      <header className="sticky top-0 z-40 border-b border-[rgba(10,21,48,0.10)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-8">
            <a href="/" className="flex items-center">
              <img src="/logo.png" alt="Consultify" className="h-9 w-auto" />
            </a>
            <nav className="hidden gap-6 text-sm font-semibold md:flex">
              <a href="/" className="text-navy-900/75 transition hover:text-navy-700">Web</a>
              <NavLink to="/calculadora" className={navItem}>Calculadora</NavLink>
              {user && (role === 'cliente' || role === 'admin') && (
                <NavLink to="/clientes" className={navItem}>Zona clientes</NavLink>
              )}
              {user && (role === 'consultor' || role === 'admin') && (
                <NavLink to="/consultores" className={navItem}>Zona consultores</NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {demo && <span className="chip bg-brand-orange/15 text-brand-orangeDark hidden sm:inline-flex">Modo demo</span>}
            {user ? (
              <>
                <span className="hidden text-xs font-semibold text-brand-muted sm:inline">{user.email}</span>
                <button onClick={logout} className="btn-ghost !px-4 !py-2">Salir</button>
              </>
            ) : (
              <Link to="/acceso" className="btn-primary !px-4 !py-2">Acceder</Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      {/* Pie espejo de la landing: navy-900, texto translúcido, enlaces naranja al hover */}
      <footer className="border-t border-white/10 bg-navy-900 py-8 text-center text-xs text-white/55">
        <img src="/logo_white.png" alt="" className="mx-auto mb-3 h-7 w-auto opacity-90" />
        <p>Consultify · Instituto de Excelencia Europea S.L. · CIF B87063076 · Madrid</p>
        <p className="mt-1">Precios sin IVA salvo indicación · <a href="/" className="transition hover:text-brand-orange">consultify.pro</a></p>
        <p className="mt-3 text-[11px] font-semibold italic text-brand-orange/90">Hecho con amor en Madrid por TuConsultor · Desde 2006 gestionando con el corazón</p>
      </footer>
    </div>
  );
}
