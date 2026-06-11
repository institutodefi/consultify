import { useState, useEffect } from 'react';
import { Users, Briefcase, BarChart3, CalendarDays } from 'lucide-react';
import TabDashboard from './components/TabDashboard';
import TabEquipo from './components/TabEquipo';
import TabProyectos from './components/TabProyectos';
import TabAgenda from './components/TabAgenda';
import { db } from './lib/supabase';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'equipo',    label: 'Equipo',    icon: Users },
  { id: 'proyectos', label: 'Proyectos', icon: Briefcase },
  { id: 'agenda',    label: 'Agenda',    icon: CalendarDays },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [consultores, setConsultores] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargarDatos = async () => {
    try {
      const [c, p] = await Promise.all([db.getConsultores(), db.getProyectos()]);
      setConsultores(c);
      setProyectos(p);
      setError(null);
    } catch (err) {
      setError('No se pudo conectar con la base de datos. Revisa las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDatos(); }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-navy">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-white px-2 py-1">
              <img src="/logo.png" alt="Consultify" className="h-6" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
            </span>
            <span className="text-lg font-extrabold text-white">Gestión <span className="text-brand">interna</span></span>
          </div>
          <nav className="flex gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  tab === id ? 'bg-brand text-navy' : 'text-slate-300 hover:bg-white/10'
                }`}>
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">Cargando datos…</p>
        ) : (
          <>
            {tab === 'dashboard' && <TabDashboard consultores={consultores} proyectos={proyectos} />}
            {tab === 'equipo' && <TabEquipo consultores={consultores} onCambio={cargarDatos} />}
            {tab === 'proyectos' && <TabProyectos consultores={consultores} proyectos={proyectos} onCambio={cargarDatos} />}
            {tab === 'agenda' && <TabAgenda consultores={consultores} proyectos={proyectos} />}
          </>
        )}
      </main>

      <footer className="mx-auto mt-12 max-w-7xl border-t border-slate-200 px-4 py-6 text-xs text-slate-400">
        Consultify · Instituto de Excelencia Europea S.L. · v2.0
      </footer>
    </div>
  );
}
