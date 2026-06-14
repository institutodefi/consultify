import { useAuth } from '../lib/auth.jsx';
import { ROL_LABEL } from '../lib/permisos.js';

// Roles que el superadmin puede previsualizar
const VISTAS = ['superadmin', 'admin', 'consultor', 'gestion', 'cliente'];

export default function BarraVerComo() {
  const { esSuper, viewAs, role, verComo, resetVista } = useAuth();
  if (!esSuper) return null;

  const simulando = Boolean(viewAs);

  return (
    <div className={`w-full text-sm ${simulando ? 'bg-brand-orange text-navy-900' : 'bg-navy-900 text-white'}`}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <span className="flex items-center gap-2 font-bold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {simulando ? `Viendo como: ${ROL_LABEL[viewAs]}` : 'Vista de superadministrador'}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          {VISTAS.map((r) => {
            const activo = role === r;
            return (
              <button key={r} onClick={() => verComo(r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition
                  ${activo
                    ? (simulando ? 'bg-navy-900 text-white' : 'bg-white text-navy-900')
                    : (simulando ? 'bg-white/30 hover:bg-white/50' : 'bg-white/10 hover:bg-white/20')}`}>
                {ROL_LABEL[r]}
              </button>
            );
          })}
        </div>

        {simulando && (
          <button onClick={resetVista}
            className="ml-auto rounded-lg bg-navy-900 px-3 py-1 text-xs font-bold text-white hover:bg-navy-800">
            ← Volver a mi vista
          </button>
        )}
      </div>
    </div>
  );
}
