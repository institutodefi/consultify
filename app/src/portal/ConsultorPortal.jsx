import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './consultores/Dashboard.jsx';
import Equipo from './consultores/Equipo.jsx';
import Proyectos from './consultores/Proyectos.jsx';
import Clientes from './consultores/Clientes.jsx';
import Agenda from './consultores/Agenda.jsx';
import ControlSistema from './consultores/ControlSistema.jsx';
import BarraVerComo from '../components/BarraVerComo.jsx';
import { useAuth } from '../lib/auth.jsx';
import { tabsParaRol, can } from '../lib/permisos.js';

// Guard: si el rol efectivo no puede ver la ruta, redirige al dashboard
function Guard({ ok, children }) {
  return ok ? children : <Navigate to="." replace />;
}

export default function ConsultorPortal() {
  const { role } = useAuth();
  const tabs = tabsParaRol(role);
  const verEquipo = can.gestionarEquipo(role);
  const verPlanAgendaSist = ['superadmin', 'admin', 'consultor'].includes(role);
  const verClientes = ['superadmin', 'admin', 'gestion'].includes(role);

  return (
    <>
      <BarraVerComo />
      <div className="mx-auto max-w-7xl px-4 py-10">
        <p className="eyebrow">Operaciones Consultify</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Zona interna</h1>
        <nav className="mt-6 flex flex-wrap gap-6 border-b border-navy-100 text-sm">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === ''} className={({ isActive }) => `pb-3 ${isActive ? 'tab-active' : 'tab-idle'}`}>{t.label}</NavLink>
          ))}
        </nav>
        <div className="mt-8">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="proyectos" element={<Proyectos />} />
            <Route path="agenda" element={<Guard ok={verPlanAgendaSist}><Agenda /></Guard>} />
            <Route path="sistemas" element={<Guard ok={verPlanAgendaSist}><ControlSistema /></Guard>} />
            <Route path="equipo" element={<Guard ok={verEquipo}><Equipo /></Guard>} />
            <Route path="clientes" element={<Guard ok={verClientes}><Clientes /></Guard>} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </div>
      </div>
    </>
  );
}
