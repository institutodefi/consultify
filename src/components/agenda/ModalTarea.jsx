import { useState } from 'react';
import { X, Trash2, CopyCheck } from 'lucide-react';
import { MAX_HORAS_DIA } from '../../lib/jornada';

export default function ModalTarea({
  tarea, fecha, consultorId, consultores, proyectos, tareasDelDia,
  onGuardar, onBorrar, onCerrar,
}) {
  const editando = Boolean(tarea?.id);
  const [form, setForm] = useState({
    consultor_id: tarea?.consultor_id ?? consultorId,
    titulo: tarea?.titulo ?? '',
    descripcion: tarea?.descripcion ?? '',
    fecha_prevista: tarea?.fecha_prevista ?? fecha,
    horas_previstas: tarea?.horas_previstas ?? 2,
    fecha_efectiva: tarea?.fecha_efectiva ?? '',
    horas_reales: tarea?.horas_reales ?? '',
    proyecto_id: tarea?.proyecto_id ?? '',
    estado: tarea?.estado ?? 'pendiente',
  });
  const [guardando, setGuardando] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── control 9h/día (convenio): previsto y real por separado ──────
  const sumaDia = (campoFecha, campoHoras, fechaForm, horasForm) => {
    const otras = tareasDelDia
      .filter((t) => t.id !== tarea?.id && t[campoFecha] === fechaForm)
      .reduce((s, t) => s + Number(t[campoHoras] || 0), 0);
    return otras + Number(horasForm || 0);
  };
  const totalPrevDia = sumaDia('fecha_prevista', 'horas_previstas', form.fecha_prevista, form.horas_previstas);
  const totalRealDia = form.fecha_efectiva
    ? sumaDia('fecha_efectiva', 'horas_reales', form.fecha_efectiva, form.horas_reales)
    : 0;
  const excedePrev = totalPrevDia > MAX_HORAS_DIA;
  const excedeReal = totalRealDia > MAX_HORAS_DIA;

  const copiarPrevistoAReal = () =>
    setForm((f) => ({
      ...f,
      fecha_efectiva: f.fecha_prevista,
      horas_reales: f.horas_previstas,
      estado: 'completada',
    }));

  const guardar = async () => {
    if (!form.titulo.trim() || !form.fecha_prevista || Number(form.horas_previstas) <= 0) return;
    setGuardando(true);
    try {
      await onGuardar({
        consultor_id: form.consultor_id,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion || null,
        fecha_prevista: form.fecha_prevista,
        horas_previstas: Number(form.horas_previstas),
        fecha_efectiva: form.fecha_efectiva || null,
        horas_reales: form.horas_reales ? Number(form.horas_reales) : null,
        proyecto_id: form.proyecto_id || null,
        estado: form.estado,
      }, tarea?.id);
    } finally {
      setGuardando(false);
    }
  };

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#061B45] focus:outline-none';
  const lbl = 'mb-1 block text-xs font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{editando ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={lbl}>Título *</label>
            <input value={form.titulo} onChange={set('titulo')} autoFocus
              placeholder="Ej.: Auditoría interna ISO 9001 — Cliente X" className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Responsable *</label>
              <select value={form.consultor_id} onChange={set('consultor_id')} className={inp}>
                {consultores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} {c.nivel ? `(${c.nivel})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Proyecto / cliente</label>
              <select value={form.proyecto_id} onChange={set('proyecto_id')} className={inp}>
                <option value="">— Sin proyecto —</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>{p.cliente ?? p.nombre ?? p.id}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── PLANIFICADO ── */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Planificado</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Fecha prevista *</label>
                <input type="date" value={form.fecha_prevista} onChange={set('fecha_prevista')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Horas programadas *</label>
                <input type="number" min="0.5" max="9" step="0.5"
                  value={form.horas_previstas} onChange={set('horas_previstas')} className={inp} />
              </div>
            </div>
            {excedePrev && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                El plan de ese día suma {totalPrevDia} h; el convenio limita a {MAX_HORAS_DIA} h ordinarias/día.
              </p>
            )}
          </div>

          {/* ── REAL ── */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ejecución real</p>
              <button onClick={copiarPrevistoAReal}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                <CopyCheck size={14} /> Copiar previsto → real
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Fecha efectiva</label>
                <input type="date" value={form.fecha_efectiva} onChange={set('fecha_efectiva')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Horas reales</label>
                <input type="number" min="0.5" max="9" step="0.5" placeholder="—"
                  value={form.horas_reales} onChange={set('horas_reales')} className={inp} />
              </div>
            </div>
            {excedeReal && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                Lo real de ese día suma {totalRealDia} h; el convenio limita a {MAX_HORAS_DIA} h ordinarias/día.
              </p>
            )}
          </div>

          <div>
            <label className={lbl}>Estado</label>
            <div className="flex gap-2">
              {[['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['completada', 'Completada']].map(([v, l]) => (
                <button key={v} onClick={() => setForm((f) => ({ ...f, estado: v }))}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                    form.estado === v
                      ? 'border-[#061B45] bg-[#061B45] text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={lbl}>Descripción</label>
            <textarea value={form.descripcion ?? ''} onChange={set('descripcion')} rows={2} className={inp} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {editando ? (
            <button onClick={() => onBorrar(tarea.id)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={15} /> Eliminar
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onCerrar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando || !form.titulo.trim()}
              className="rounded-lg bg-[#F5A623] px-4 py-2 text-sm font-bold text-[#061B45] hover:brightness-105 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar tarea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
