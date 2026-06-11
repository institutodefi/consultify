import { useMemo, useState } from 'react';
import { Calculator, Plus, Pencil, Trash2, X, AlertCircle } from 'lucide-react';
import { NORMAS, NORMA_BY_ID, MODELOS, NOMBRES_MODELOS, IVA } from '../lib/catalogo';
import { calcular, eur, eur2 } from '../lib/calculadora';
import { db } from '../lib/supabase';

const ESTADOS = ['activo', 'pausado', 'finalizado'];
const ESTILO_ESTADO = {
  activo: 'bg-emerald-100 text-emerald-700',
  pausado: 'bg-amber-100 text-amber-700',
  finalizado: 'bg-slate-100 text-slate-500',
};

export default function TabProyectos({ consultores, proyectos, onCambio }) {
  // ── Calculadora ───────────────────────────────────────────────────
  const [normasSel, setNormasSel] = useState(['9001']);
  const [modeloSel, setModeloSel] = useState('Implicación');
  const calc = useMemo(() => calcular(normasSel, modeloSel), [normasSel, modeloSel]);

  // ── Modal de proyecto ─────────────────────────────────────────────
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const toggleNorma = (id) =>
    setNormasSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const abrirDesdeCalculadora = () => {
    if (!calc) return;
    setForm({
      cliente: '',
      normas: [...normasSel],
      modelo: modeloSel,
      consultor_id: '',
      estado: 'activo',
    });
  };

  const calcForm = form ? calcular(form.normas, form.modelo) : null;

  // Filtrado inteligente: solo consultores que cubren TODAS las normas del proyecto
  const compatibles = useMemo(() => {
    if (!form) return [];
    return consultores.filter((c) => form.normas.every((n) => (c.normas ?? []).includes(n)));
  }, [form, consultores]);

  const guardar = async () => {
    if (!form.cliente.trim() || !form.normas.length || !calcForm) return;
    setGuardando(true); setError(null);
    try {
      const esBolsa = calcForm.tipo === 'bolsa';
      const datos = {
        cliente: form.cliente.trim(),
        normas: form.normas,
        modelo: form.modelo,
        consultor_id: form.consultor_id || null,
        estado: form.estado,
        // cache de cálculos para que el dashboard no recalcule
        h_total_mes: esBolsa ? 0 : calcForm.hTotal,
        precio_mes: esBolsa ? null : calcForm.precioCatalogo,
        precio_total: esBolsa ? calcForm.precioCatalogo : null,
      };
      if (form.id) await db.actualizarProyecto(form.id, datos);
      else await db.crearProyecto(datos);
      setForm(null);
      onCambio();
    } catch {
      setError('No se pudo guardar el proyecto.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p) => {
    if (!window.confirm(`¿Eliminar el proyecto de ${p.cliente}?`)) return;
    try { await db.borrarProyecto(p.id); onCambio(); }
    catch { setError('No se pudo eliminar el proyecto.'); }
  };

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* ═══ CALCULADORA ═══ */}
      <div className="rounded-2xl border border-navy/20 bg-navy p-5 text-white shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Calculator size={18} className="text-brand" />
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand">Calculadora de servicio</h3>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-white/60">Normas</p>
              <div className="flex flex-wrap gap-1.5">
                {NORMAS.map((n) => (
                  <button key={n.id} onClick={() => toggleNorma(n.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      normasSel.includes(n.id)
                        ? 'border-brand bg-brand text-navy'
                        : 'border-white/20 text-white/70 hover:border-white/50'
                    }`}>
                    {n.nombre} <span className="opacity-60">({n.nivel})</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-white/60">Modelo</p>
              <div className="flex flex-wrap gap-1.5">
                {NOMBRES_MODELOS.map((m) => (
                  <button key={m} onClick={() => setModeloSel(m)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      modeloSel === m
                        ? 'border-brand bg-brand text-navy'
                        : 'border-white/20 text-white/70 hover:border-white/50'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/40">
                Apoyo: bolsa única, 100 % anticipado, no contratable a &lt;60 días de auditoría externa ·
                Acompañamiento auditoría aparte: 600 €/día
              </p>
            </div>
          </div>

          {calc && (
            <div className="rounded-xl bg-white/5 p-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-white/60">Horas J2</span><span className="text-right font-bold">{calc.hJ2} h</span>
                <span className="text-white/60">Horas J3</span><span className="text-right font-bold">{calc.hJ3} h</span>
                <span className="text-white/60">Coordinación ({calc.nivelCoord})</span><span className="text-right font-bold">{calc.hCoord} h</span>
                <span className="text-white/60">Total {calc.tipo === 'bolsa' ? '(bolsa)' : '/mes'}</span>
                <span className="text-right font-extrabold text-brand">{calc.hTotal} h</span>
                <span className="col-span-2 my-1 border-t border-white/10" />
                <span className="text-white/60">Coste interno</span><span className="text-right font-bold">{eur(calc.coste)}</span>
                <span className="text-white/60">Precio exacto (60 %)</span><span className="text-right">{eur2(calc.precioExacto)}</span>
                <span className="text-white/60">Precio catálogo</span>
                <span className="text-right text-lg font-extrabold text-brand">
                  {eur(calc.precioCatalogo)}{calc.tipo === 'mes' ? '/mes' : ''}
                </span>
                <span className="text-white/60">Con IVA {IVA * 100} %</span><span className="text-right font-bold">{eur2(calc.precioConIva)}</span>
                <span className="text-white/60">Margen</span>
                <span className="text-right font-bold text-emerald-400">
                  {eur(calc.margenEur)} ({Math.round(calc.margenPct * 100)} %)
                </span>
              </div>
              <button onClick={abrirDesdeCalculadora}
                className="mt-4 w-full rounded-lg bg-brand py-2 text-sm font-bold text-navy hover:brightness-105">
                Crear proyecto con esta configuración
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ CARTERA ═══ */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Cartera de proyectos</h3>
        <button onClick={abrirDesdeCalculadora}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-105">
          <Plus size={16} /> Nuevo proyecto
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Normas</th>
              <th className="px-4 py-3">Modelo</th>
              <th className="px-4 py-3">Consultor</th>
              <th className="px-4 py-3 text-right">H/mes</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {proyectos.map((p) => {
              const consultor = consultores.find((c) => c.id === p.consultor_id);
              return (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">{p.cliente}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-[200px] flex-wrap gap-1">
                      {(p.normas ?? []).map((id) => (
                        <span key={id} className="rounded bg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold text-navy">
                          {NORMA_BY_ID[id]?.nombre ?? id}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.modelo}</td>
                  <td className="px-4 py-3">{consultor?.nombre ?? <span className="text-slate-400">Sin asignar</span>}</td>
                  <td className="px-4 py-3 text-right">{p.modelo === 'Apoyo' ? '—' : `${p.h_total_mes} h`}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {p.modelo === 'Apoyo' ? `${eur(p.precio_total)} único` : `${eur(p.precio_mes)}/mes`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${ESTILO_ESTADO[p.estado]}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setForm({ ...p })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy" aria-label="Editar">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => borrar(p)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {proyectos.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                Sin proyectos. Usa la calculadora de arriba para crear el primero.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ═══ MODAL PROYECTO ═══ */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setForm(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{form.id ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>
              <button onClick={() => setForm(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Cliente *</label>
                <input value={form.cliente} onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))} autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Normas *</label>
                <div className="flex flex-wrap gap-1.5">
                  {NORMAS.map((n) => (
                    <button key={n.id} type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        normas: f.normas.includes(n.id) ? f.normas.filter((x) => x !== n.id) : [...f.normas, n.id],
                        consultor_id: '', // recalcular compatibles
                      }))}
                      className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                        form.normas.includes(n.id)
                          ? 'border-navy bg-navy text-white'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}>
                      {n.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Modelo</label>
                  <select value={form.modelo}
                    onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy focus:outline-none">
                    {NOMBRES_MODELOS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Estado</label>
                  <select value={form.estado}
                    onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm capitalize focus:border-navy focus:outline-none">
                    {ESTADOS.map((e2) => <option key={e2}>{e2}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Consultor (cubre todas las normas)</label>
                <select value={form.consultor_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, consultor_id: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy focus:outline-none">
                  <option value="">— Sin asignar —</option>
                  {compatibles.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.nivel})</option>
                  ))}
                </select>
                {form.normas.length > 0 && compatibles.length === 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                    <AlertCircle size={13} /> Ningún consultor cubre todas las normas seleccionadas. Amplía sus normas en Equipo.
                  </p>
                )}
              </div>

              {calcForm && (
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-slate-500">Horas {calcForm.tipo === 'bolsa' ? 'bolsa' : '/mes'}</span>
                    <span className="text-right font-bold">{calcForm.hTotal} h</span>
                    <span className="text-slate-500">Precio catálogo</span>
                    <span className="text-right font-extrabold text-navy">
                      {eur(calcForm.precioCatalogo)}{calcForm.tipo === 'mes' ? '/mes' : ' único'}
                    </span>
                    <span className="text-slate-500">Margen</span>
                    <span className="text-right font-semibold text-emerald-600">{Math.round(calcForm.margenPct * 100)} %</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setForm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !form.cliente.trim() || !form.normas.length}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-105 disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
