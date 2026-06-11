import { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { NORMAS, TARIFA } from '../lib/catalogo';
import { db, horasProduccionMes } from '../lib/supabase';

const NIVELES = ['J1', 'J2', 'J3', 'Senior'];
const VACIO = { nombre: '', nivel: 'J2', horas_sem: 35, normas: [] };

export default function TabEquipo({ consultores, onCambio }) {
  const [form, setForm] = useState(null); // null | objeto (con id = edición)
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!form.nombre.trim()) return;
    setGuardando(true); setError(null);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        nivel: form.nivel,
        horas_sem: Number(form.horas_sem),
        normas: form.normas,
      };
      if (form.id) await db.actualizarConsultor(form.id, datos);
      else await db.crearConsultor(datos);
      setForm(null);
      onCambio();
    } catch {
      setError('No se pudo guardar el consultor.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (c) => {
    if (!window.confirm(`¿Dar de baja a ${c.nombre}? Sus proyectos conservarán el histórico.`)) return;
    try {
      await db.borrarConsultor(c.id);
      onCambio();
    } catch {
      setError('No se pudo dar de baja al consultor.');
    }
  };

  const toggleNorma = (id) =>
    setForm((f) => ({
      ...f,
      normas: f.normas.includes(id) ? f.normas.filter((x) => x !== id) : [...f.normas, id],
    }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Tarifas internas: J1 {TARIFA.J1} € · J2 {TARIFA.J2} € · J3 {TARIFA.J3} € · Senior {TARIFA.Senior} €/h · margen 60 %
        </p>
        <button onClick={() => setForm({ ...VACIO })}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-105">
          <Plus size={16} /> Añadir consultor
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Consultor</th>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3">Tarifa</th>
              <th className="px-4 py-3">H/sem</th>
              <th className="px-4 py-3">H prod/mes</th>
              <th className="px-4 py-3">Normas</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {consultores.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{c.nombre}</td>
                <td className="px-4 py-3">{c.nivel}</td>
                <td className="px-4 py-3">{TARIFA[c.nivel]} €/h</td>
                <td className="px-4 py-3">{c.horas_sem}</td>
                <td className="px-4 py-3 font-semibold">{horasProduccionMes(Number(c.horas_sem))} h</td>
                <td className="px-4 py-3">
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {(c.normas ?? []).map((id) => (
                      <span key={id} className="rounded bg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold text-navy">
                        {NORMAS.find((n) => n.id === id)?.nombre ?? id}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setForm({ ...c })}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy" aria-label="Editar">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => borrar(c)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Dar de baja">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {consultores.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                Sin consultores. Añade el primero con el botón de arriba.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        H prod/mes = h/sem × 4,33 × (30/35 producción) × (11/12 vacaciones). Ej.: 35 h/sem → 119 h productivas/mes.
      </p>

      {/* Modal alta/edición */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{form.id ? 'Editar consultor' : 'Nuevo consultor'}</h3>
              <button onClick={() => setForm(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre *</label>
                <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Nivel</label>
                  <select value={form.nivel} onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy focus:outline-none">
                    {NIVELES.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Horas/semana</label>
                  <input type="number" min="10" max="40" value={form.horas_sem}
                    onChange={(e) => setForm((f) => ({ ...f, horas_sem: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Normas que puede llevar · capacidad: {horasProduccionMes(Number(form.horas_sem || 35))} h/mes
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {NORMAS.map((n) => (
                    <button key={n.id} onClick={() => toggleNorma(n.id)} type="button"
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
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setForm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !form.nombre.trim()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-105 disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
