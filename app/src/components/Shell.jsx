import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Shell({ children }) {
  const { user, role, logout, demo } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <a href="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="Consultify" className="h-9 w-auto" />
            </a>
            <nav className="hidden gap-6 text-sm font-semibold md:flex">
              <a href="/" className="text-navy-400 hover:text-navy-900">Web</a>
              <NavLink to="/calculadora" className={({isActive}) => isActive ? 'text-navy-900' : 'text-navy-400 hover:text-navy-900'}>Calculadora</NavLink>
              {user && (role === 'cliente' || role === 'admin') && (
                <NavLink to="/clientes" className={({isActive}) => isActive ? 'text-navy-900' : 'text-navy-400 hover:text-navy-900'}>Zona clientes</NavLink>
              )}
              {user && (role === 'consultor' || role === 'admin') && (
                <NavLink to="/consultores" className={({isActive}) => isActive ? 'text-navy-900' : 'text-navy-400 hover:text-navy-900'}>Zona consultores</NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {demo && <span className="chip bg-brand-orange/15 text-brand-orangeDark hidden sm:inline-flex">Modo demo</span>}
            {user ? (
              <>
                <span className="hidden text-xs font-semibold text-navy-400 sm:inline">{user.email}</span>
                <button onClick={logout} className="btn-ghost !px-4 !py-2 text-sm">Salir</button>
              </>
            ) : (
              <Link to="/acceso" className="btn-primary !px-4 !py-2 text-sm">Acceder</Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-navy-100 bg-white py-6 text-center text-xs text-navy-400">
        Consultify · Instituto de Excelencia Europea S.L. · CIF B87063076 · Madrid · Precios sin IVA salvo indicación
      </footer>
    </div>
  );
}
