// Box de equipo reutilizable: elige (✓) qué consultores entran en los relojes.
// activoId opcional: si se pasa onActivo, el nombre es clicable para marcar activo (●).
export default function BoxEquipo({ consultores, sel, setSel, activoId, onActivo, capacidad, titulo = 'Equipo en los relojes' }) {
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(String(id)) ? n.delete(String(id)) : n.add(String(id)); return n; });
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-extrabold">{titulo}</h3>
        <div className="flex gap-2">
          <button onClick={() => setSel(new Set(consultores.map(c => String(c.id))))} className="chip border border-navy-200 text-[11px] font-bold text-navy-500">Todos</button>
          <button onClick={() => setSel(new Set(activoId ? [String(activoId)] : []))} className="chip border border-navy-200 text-[11px] font-bold text-navy-500">{activoId ? 'Solo activo' : 'Ninguno'}</button>
        </div>
      </div>
      <p className="mt-1 text-xs font-medium text-navy-400">
        Marca (✓) los consultores cuya carga se suma en los relojes.{onActivo ? ' Haz clic en un nombre para marcarlo como activo (●).' : ''}
      </p>
      <div className="mt-3 max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
              <th className="py-2 w-8"></th><th className="py-2">Consultor</th><th className="py-2">Nivel</th><th className="py-2 text-right">Jornada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {consultores.map(c => {
              const on = sel.has(String(c.id));
              const activo = onActivo && String(c.id) === String(activoId);
              return (
                <tr key={c.id} className={`${on ? 'bg-brand-orange/5' : ''} ${activo ? 'ring-1 ring-inset ring-navy-300' : ''}`}>
                  <td className="py-1.5"><input type="checkbox" checked={on} onChange={() => toggle(c.id)} /></td>
                  <td className="py-1.5">
                    {onActivo ? (
                      <button onClick={() => onActivo(String(c.id))} className={`font-medium hover:text-brand-orange ${activo ? 'text-navy-900 font-bold' : ''}`} title="Marcar como consultor activo">
                        {c.nombre} {c.apellidos || ''}{activo ? ' ●' : ''}
                      </button>
                    ) : (
                      <span className="font-medium">{c.nombre} {c.apellidos || ''}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-navy-400">{c.nivel || '—'}</td>
                  <td className="py-1.5 text-right text-navy-400">{c.pct_jornada ?? 100}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-navy-50 pt-3 text-xs font-medium text-navy-400">
        {sel.size} consultor(es){capacidad != null ? ` · capacidad sumada ${Math.round(capacidad)}%` : ''}
      </p>
    </div>
  );
}
