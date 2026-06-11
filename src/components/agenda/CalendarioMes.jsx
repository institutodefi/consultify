import { ChevronLeft, ChevronRight, Plus, Plane } from 'lucide-react';
import {
  diasDelMes, esLaborable, horasDia, toISO, hoyISO, MESES, MAX_HORAS_DIA,
} from '../../lib/jornada';

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export default function CalendarioMes({
  year, mes, onCambiarMes,
  festivos,          // Map iso -> nombre
  vacacionesSet,     // Set iso
  tareas,            // [{id, fecha_prevista, horas_previstas, fecha_efectiva, horas_reales, titulo, estado}]
  modoVacaciones,    // bool: clic en día = alta/baja de vacaciones
  onToggleVacacion,  // (iso) => void
  onNuevaTarea,      // (iso) => void
  onEditarTarea,     // (tarea) => void
}) {
  const hoy = hoyISO();
  const dias = diasDelMes(year, mes);
  const offset = (dias[0].getDay() + 6) % 7; // lunes = 0
  const festivosSet = new Set(festivos.keys());
  const prefijo = `${year}-${String(mes + 1).padStart(2, '0')}-`;

  // Por día: chips previstos y reales (si la efectiva difiere, sale en ambos días)
  const porDia = {};
  for (const t of tareas) {
    if (t.fecha_prevista?.startsWith(prefijo)) {
      (porDia[t.fecha_prevista] ??= []).push({ t, tipo: 'prev' });
    }
    if (t.fecha_efectiva && t.horas_reales && t.fecha_efectiva.startsWith(prefijo)
        && t.fecha_efectiva !== t.fecha_prevista) {
      (porDia[t.fecha_efectiva] ??= []).push({ t, tipo: 'real' });
    }
  }

  const estiloEstado = {
    pendiente:  'bg-amber-100 text-amber-800',
    en_curso:   'bg-blue-100 text-blue-800',
    completada: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <div>
      {/* cabecera */}
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => onCambiarMes(-1)} disabled={mes === 0}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          aria-label="Mes anterior">
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-base font-bold text-slate-900">{MESES[mes]} {year}</h3>
        <button onClick={() => onCambiarMes(1)} disabled={mes === 11}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          aria-label="Mes siguiente">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => <div key={`v${i}`} />)}

        {dias.map((d) => {
          const iso = toISO(d);
          const laborable = esLaborable(d, festivosSet);
          const festivo = festivos.get(iso);
          const vacacion = vacacionesSet.has(iso);
          const entradas = porDia[iso] ?? [];
          const hPrev = entradas.filter((e) => e.tipo === 'prev')
            .reduce((s, e) => s + Number(e.t.horas_previstas), 0);
          const hReal = tareas
            .filter((t) => t.fecha_efectiva === iso && t.horas_reales)
            .reduce((s, t) => s + Number(t.horas_reales), 0);
          const exceso = hPrev > MAX_HORAS_DIA || hReal > MAX_HORAS_DIA;
          const esHoy = iso === hoy;

          let base = 'bg-white border-slate-200';
          if (!laborable && !festivo) base = 'bg-slate-50 border-slate-100 text-slate-400';
          if (festivo) base = 'bg-rose-50 border-rose-200';
          if (vacacion) base = 'bg-sky-50 border-sky-300';

          return (
            <div key={iso}
              onClick={() => {
                if (modoVacaciones) { if (laborable) onToggleVacacion(iso); return; }
                if (laborable && !vacacion) onNuevaTarea(iso);
              }}
              className={`group min-h-[88px] rounded-lg border p-1.5 text-left transition
                ${base} ${esHoy ? 'ring-2 ring-[#F5A623]' : ''}
                ${(laborable && (modoVacaciones || !vacacion)) ? 'cursor-pointer hover:border-[#061B45]/40' : ''}`}
            >
              <div className="flex items-start justify-between">
                <span className={`text-xs font-semibold ${esHoy ? 'text-[#F5A623]' : ''}`}>{d.getDate()}</span>
                {laborable && !vacacion && (
                  <span className={`text-[10px] font-medium ${exceso ? 'text-red-600' : 'text-slate-400'}`}>
                    {hPrev > 0 || hReal > 0
                      ? <>{hPrev > 0 && `${hPrev}h`}{hReal > 0 && <span className="text-emerald-600"> ✓{hReal}h</span>}</>
                      : `· ${horasDia(d)}h`}
                  </span>
                )}
                {vacacion && <Plane size={12} className="text-sky-500" />}
              </div>

              {festivo && <p className="mt-0.5 truncate text-[10px] leading-tight text-rose-600">{festivo}</p>}
              {exceso && <p className="text-[10px] font-semibold text-red-600">&gt;9h/día</p>}

              <div className="mt-1 space-y-0.5">
                {entradas.slice(0, 3).map(({ t, tipo }) => {
                  const hechaAqui = tipo === 'prev' && t.fecha_efectiva === t.fecha_prevista && t.horas_reales;
                  return (
                    <button key={`${t.id}-${tipo}`}
                      onClick={(e) => { e.stopPropagation(); onEditarTarea(t); }}
                      className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium
                        ${tipo === 'real'
                          ? 'border border-emerald-300 bg-white text-emerald-700'
                          : estiloEstado[t.estado] ?? estiloEstado.pendiente}`}
                      title={`${t.titulo} · prev ${t.horas_previstas}h${t.horas_reales ? ` · real ${t.horas_reales}h` : ''}`}
                    >
                      {tipo === 'real'
                        ? <>✓{t.horas_reales}h · {t.titulo}</>
                        : <>{hechaAqui ? `✓${t.horas_reales}` : t.horas_previstas}h · {t.titulo}</>}
                    </button>
                  );
                })}
                {entradas.length > 3 && (
                  <p className="text-[10px] text-slate-400">+{entradas.length - 3} más</p>
                )}
              </div>

              {laborable && !vacacion && !modoVacaciones && entradas.length === 0 && (
                <Plus size={12} className="mt-1 text-slate-300 opacity-0 transition group-hover:opacity-100" />
              )}
            </div>
          );
        })}
      </div>

      {/* leyenda */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-rose-200 align-middle" />Festivo</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-sky-200 align-middle" />Vacaciones</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-amber-200 align-middle" />Pendiente</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-blue-200 align-middle" />En curso</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-emerald-200 align-middle" />Completada</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-emerald-300 bg-white align-middle" />✓ Real ejecutado otro día</span>
      </div>
    </div>
  );
}
