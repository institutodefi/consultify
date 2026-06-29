import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './consultores/Dashboard.jsx';
import Equipo from './consultores/Equipo.jsx';
import Clientes from './consultores/Clientes.jsx';
import Ofertas from './consultores/Ofertas.jsx';
import ProyectosConfig from './consultores/ProyectosConfig.jsx';
import Agenda from './consultores/Agenda.jsx';
import MiAgenda from './consultores/MiAgenda.jsx';
import Sistemas from './consultores/Sistemas.jsx';
import PlanificadorTareas from '../pages/PlanificadorTareas.jsx';
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-10">
        <p className="eyebrow">Operaciones Consultify</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">Zona interna</h1>
        <nav className="mt-5 sm:mt-6 flex gap-4 sm:gap-6 border-b border-navy-100 text-sm overflow-x-auto -mx-4 px-4 scrollbar-none">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === ''} className={({ isActive }) => `pb-3 whitespace-nowrap shrink-0 ${isActive ? 'tab-active' : 'tab-idle'}`}>{t.label}</NavLink>
          ))}
        </nav>
        <div className="mt-6 sm:mt-8">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="proyectos" element={<Guard ok={verClientes}><ProyectosConfig /></Guard>} />
            <Route path="agenda" element={<Guard ok={verPlanAgendaSist}><Agenda /></Guard>} />
            <Route path="mi-agenda" element={<Guard ok={verPlanAgendaSist}><MiAgenda /></Guard>} />
            <Route path="planificador" element={<Guard ok={verPlanAgendaSist}><PlanificadorTareas /></Guard>} />
            <Route path="equipo" element={<Guard ok={verEquipo}><Equipo /></Guard>} />
            <Route path="sistemas" element={<Guard ok={verEquipo}><Sistemas /></Guard>} />
            <Route path="clientes" element={<Guard ok={verClientes}><Clientes /></Guard>} />
            <Route path="ofertas" element={<Guard ok={verClientes}><Ofertas /></Guard>} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </div>
      </div>
    </>
  );
}
