import { useEffect, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, TARIFA, EFICIENCIA } from '../../lib/calcEngine.js';

// Horas/mes de jornada completa (≈1.800 h/año ÷ 12) escaladas por % jornada
const HORAS_MES_COMPLETA = 150;
const horasMes = (pct) => Math.round(HORAS_MES_COMPLETA * (Number(pct) || 0) / 100);

const NIVELES = ['J1', 'J2', 'J3', 'Senior'];
const VACIO = { nombre: '', apellidos: '', email: '', nivel: 'J2', normas: [], pct_jornada: 100, activo: true };
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default function Equipo() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => listTable('consultores').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  async function guardar(e) {
    e.preventDefault(); setErr(null);
    if (form.email && !emailValido(form.email)) { setErr('El correo electrónico no tiene un formato válido.'); return; }
    try {
      const datos = {
        nombre: form.nombre, apellidos: form.apellidos || null, email: form.email || null,
        nivel: form.nivel, normas: form.normas, pct_jornada: +form.pct_jornada, activo: form.activo,
      };
      if (form.id) await updateRow('consultores', form.id, datos);
      else await insertRow('consultores', datos);
      setForm(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Eliminar este consultor? Los proyectos asignados quedarán sin consultor.')) return;
    await deleteRow('consultores', id); load();
  }

  if (!rows) return <p className="font-semibold text-navy-400">Cargando…</p>;
  const nombreCompleto = (c) => [c.nombre, c.apellidos].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-navy-400"><p>Tarifas: J1 {TARIFA.J1} € · J2 {TARIFA.J2} € · J3 {TARIFA.J3} € · Senior {TARIFA.Senior} €/h · margen 60 %</p><p className="text-xs">Eficiencia s/tarea base: J1 {EFICIENCIA.J1*100}% · J2 {EFICIENCIA.J2*100}% · J3 {EFICIENCIA.J3*100}% · Senior {EFICIENCIA.Senior*100}%</p></div>
        <button onClick={() => setForm({ ...VACIO })} className="btn-orange">+ Añadir consultor</button>
      </div>

      {form && (
        <form onSubmit={guardar} className="card space-y-4">
          <h3 className="font-extrabold">{form.id ? `Editar · ${nombreCompleto(form)}` : 'Nuevo consultor'}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="e-nombre">Nombre</label><input id="e-nombre" required className="input" autoComplete="given-name" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
            <div><label className="label" htmlFor="e-apellidos">Apellidos</label><input id="e-apellidos" className="input" autoComplete="family-name" value={form.apellidos || ''} onChange={e => setForm({ ...form, apellidos: e.target.value })} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className="label" htmlFor="e-email">Correo electrónico</label><input id="e-email" type="email" className="input" autoComplete="email" placeholder="nombre@consultify.es" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label" htmlFor="e-nivel">Nivel</label>
              <select id="e-nivel" className="input" value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })}>
                {NIVELES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="e-cap">Jornada (% de completa)</label><input id="e-cap" type="number" min="0" max="100" step="5" required className="input" value={form.pct_jornada} onChange={e => setForm({ ...form, pct_jornada: e.target.value })} /><p className="mt-1 text-[11px] font-semibold text-navy-300">{horasMes(form.pct_jornada)} h/mes · {Math.round(horasMes(form.pct_jornada)*0.7)} h productivas</p></div>
          </div>
          <div>
            <p className="label">Normas que domina</p>
            <div className="flex flex-wrap gap-2">
              {NORMAS.map(n => {
                const on = form.normas.includes(n.id);
                return (
                  <button type="button" key={n.id}
                    onClick={() => setForm({ ...form, normas: on ? form.normas.filter(x => x !== n.id) : [...form.normas, n.id] })}
                    className={`chip border transition ${on ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
                    {n.nombre}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} /> Activo
          </label>
          {err && <p className="text-sm font-bold text-red-600">{err}</p>}
          <div className="flex gap-3">
            <button className="btn-primary">Guardar</button>
            <button type="button" onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-300">
            <th className="px-5 py-3">Consultor</th><th className="px-5 py-3">Correo</th><th className="px-5 py-3">Nivel</th><th className="px-5 py-3">Normas</th><th className="px-5 py-3">Jornada</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th>
          </tr></thead>
          <tbody className="divide-y divide-navy-50">
            {rows.map(c => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-extrabold">{nombreCompleto(c)}</td>
                <td className="px-5 py-3 font-medium text-navy-400">{c.email || '—'}</td>
                <td className="px-5 py-3"><span className="chip bg-navy-50 text-navy-700">{c.nivel}</span></td>
                <td className="px-5 py-3 font-medium text-navy-400">{(c.normas || []).map(id => NORMA_BY_ID[id]?.nombre || id).join(', ') || '—'}</td>
                <td className="px-5 py-3 font-semibold">{c.pct_jornada ?? 100}% · {horasMes(c.pct_jornada ?? 100)} h/mes</td>
                <td className="px-5 py-3"><span className={`chip ${c.activo ? 'bg-green-100 text-green-800' : 'bg-navy-50 text-navy-300'}`}>{c.activo ? 'activo' : 'inactivo'}</span></td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => setForm({ ...c, normas: c.normas || [], pct_jornada: c.pct_jornada ?? 100 })} className="font-bold text-navy-700 hover:underline">Editar</button>
                  <button onClick={() => borrar(c.id)} className="ml-4 font-bold text-red-600 hover:underline">Eliminar</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="7" className="px-5 py-8 text-center font-medium text-navy-400">Sin consultores. Añade el primero.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
