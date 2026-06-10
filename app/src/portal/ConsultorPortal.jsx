import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './consultores/Dashboard.jsx';
import Equipo from './consultores/Equipo.jsx';
import Proyectos from './consultores/Proyectos.jsx';
import Clientes from './consultores/Clientes.jsx';

export default function ConsultorPortal() {
  const tabs = [
    { to: '', end: true, label: 'Dashboard' },
    { to: 'proyectos', label: 'Proyectos' },
    { to: 'equipo', label: 'Equipo' },
    { to: 'clientes', label: 'Clientes' },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Zona de consultores</h1>
      <nav className="mt-6 flex gap-6 border-b border-navy-100 text-sm">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({isActive}) => `pb-3 ${isActive ? 'tab-active' : 'tab-idle'}`}>{t.label}</NavLink>
        ))}
      </nav>
      <div className="mt-8">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="proyectos" element={<Proyectos />} />
          <Route path="equipo" element={<Equipo />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </div>
    </div>
  );
}
