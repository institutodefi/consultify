import { useEffect, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, TARIFA, EFICIENCIA } from '../../lib/calcEngine.js';
import { useAuth } from '../../lib/auth.jsx';

const NIVELES = ['J1', 'J2', 'J3', 'Senior'];
const SUBTIPOS = [
  { id: 'comercial', label: 'Comercial' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'administrativo', label: 'Administrativo' },
];
const HORAS_MES_COMPLETA = 150;
const horasMes = (pct) => Math.round(HORAS_MES_COMPLETA * (Number(pct) || 0) / 100);
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const VACIO_CONSULTOR = { tipo_equipo: 'consultor', nombre: '', apellidos: '', email: '', nivel: 'J2', normas: [], pct_jornada: 100, activo: true };
const VACIO_GESTION = { tipo_equipo: 'gestion', nombre: '', apellidos: '', email: '', subtipo: 'comercial', pct_jornada: 100, activo: true };

export default function Equipo() {
  const { verEconomico } = useAuth();
  const [sub, setSub] = useState('consultor'); // pestaña: consultor | gestion
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => listTable('consultores').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const esGestion = sub === 'gestion';
  const lista = (rows || []).filter(c => (c.tipo_equipo || 'consultor') === sub);

  async function guardar(e) {
    e.preventDefault(); setErr(null);
    if (form.email && !emailValido(form.email)) { setErr('Correo no válido.'); return; }
    try {
      const base = {
        tipo_equipo: form.tipo_equipo,
        nombre: form.nombre, apellidos: form.apellidos || null, email: form.email || null,
        pct_jornada: +form.pct_jornada, activo: form.activo,
      };
      const datos = form.tipo_equipo === 'gestion'
        ? { ...base, subtipo: form.subtipo, nivel: null, normas: [] }
        : { ...base, nivel: form.nivel, normas: form.normas, subtipo: null };
      if (form.id) await updateRow('consultores', form.id, datos);
      else await insertRow('consultores', datos);
      setForm(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Eliminar este miembro del equipo?')) return;
    await deleteRow('consultores', id); load();
  }

  if (!rows) return <p className="font-semibold text-navy-400">Cargando…</p>;
  const nombreCompleto = (c) => [c.nombre, c.apellidos].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      {/* Sub-pestañas */}
      <div className="flex gap-2">
        {[['consultor', 'Consultores'], ['gestion', 'Equipo de gestión']].map(([id, label]) => (
          <button key={id} onClick={() => { setSub(id); setForm(null); }}
            className={`chip border transition ${sub === id ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        {verEconomico
          ? <div className="text-sm font-medium text-navy-400">
              <p>Tarifas: J1 {TARIFA.J1} € · J2 {TARIFA.J2} € · J3 {TARIFA.J3} € · Senior {TARIFA.Senior} €/h · margen 60 %</p>
              <p className="text-xs">Eficiencia s/tarea base: J1 {EFICIENCIA.J1 * 100}% · J2 {EFICIENCIA.J2 * 100}% · J3 {EFICIENCIA.J3 * 100}% · Senior {EFICIENCIA.Senior * 100}%</p>
            </div>
          : <p className="text-sm font-medium text-navy-400">{esGestion ? 'Comercial · Marketing · Administrativo' : 'Directores de proyecto y consultores de entrega'}</p>}
        <button onClick={() => setForm({ ...(esGestion ? VACIO_GESTION : VACIO_CONSULTOR) })} className="btn-orange">
          + Añadir {esGestion ? 'gestión' : 'consultor'}
        </button>
      </div>

      {form && (
        <form onSubmit={guardar} className="card space-y-4">
          <h3 className="font-extrabold">{form.id ? `Editar · ${nombreCompleto(form)}` : (form.tipo_equipo === 'gestion' ? 'Nuevo · Equipo de gestión' : 'Nuevo consultor')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="e-nombre">Nombre</label><input id="e-nombre" required className="input" autoComplete="given-name" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
            <div><label className="label" htmlFor="e-apellidos">Apellidos</label><input id="e-apellidos" className="input" autoComplete="family-name" value={form.apellidos || ''} onChange={e => setForm({ ...form, apellidos: e.target.value })} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className="label" htmlFor="e-email">Correo electrónico</label><input id="e-email" type="email" className="input" autoComplete="email" placeholder="nombre@consultify.pro" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            {form.tipo_equipo === 'gestion' ? (
              <div><label className="label" htmlFor="e-sub">Función</label>
                <select id="e-sub" className="input" value={form.subtipo} onChange={e => setForm({ ...form, subtipo: e.target.value })}>
                  {SUBTIPOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            ) : (
              <div><label className="label" htmlFor="e-nivel">Nivel</label>
                <select id="e-nivel" className="input" value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })}>
                  {NIVELES.map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
            )}
            <div><label className="label" htmlFor="e-cap">Jornada (% de completa)</label><input id="e-cap" type="number" min="0" max="100" step="5" required className="input" value={form.pct_jornada} onChange={e => setForm({ ...form, pct_jornada: e.target.value })} /><p className="mt-1 text-[11px] font-semibold text-navy-300">{horasMes(form.pct_jornada)} h/mes · {Math.round(horasMes(form.pct_jornada) * 0.7)} h productivas</p></div>
          </div>
          {form.tipo_equipo === 'consultor' && (
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
          )}
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
            <th className="px-5 py-3">{esGestion ? 'Persona' : 'Consultor'}</th>
            <th className="px-5 py-3">Correo</th>
            <th className="px-5 py-3">{esGestion ? 'Función' : 'Nivel'}</th>
            {!esGestion && <th className="px-5 py-3">Normas</th>}
            <th className="px-5 py-3">Jornada</th>
            <th className="px-5 py-3">Estado</th>
            <th className="px-5 py-3 text-right">Acciones</th>
          </tr></thead>
          <tbody className="divide-y divide-navy-50">
            {lista.map(c => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-extrabold">{nombreCompleto(c)}</td>
                <td className="px-5 py-3 font-medium text-navy-400">{c.email || '—'}</td>
                <td className="px-5 py-3"><span className="chip bg-navy-50 text-navy-700 capitalize">{esGestion ? (c.subtipo || '—') : (c.nivel || '—')}</span></td>
                {!esGestion && <td className="px-5 py-3 font-medium text-navy-400">{(c.normas || []).map(id => NORMA_BY_ID[id]?.nombre || id).join(', ') || '—'}</td>}
                <td className="px-5 py-3 font-semibold">{c.pct_jornada ?? 100}% · {horasMes(c.pct_jornada ?? 100)} h/mes</td>
                <td className="px-5 py-3"><span className={`chip ${c.activo ? 'bg-green-100 text-green-800' : 'bg-navy-50 text-navy-300'}`}>{c.activo ? 'activo' : 'inactivo'}</span></td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => setForm({ ...c, normas: c.normas || [], pct_jornada: c.pct_jornada ?? 100, subtipo: c.subtipo || 'comercial' })} className="font-bold text-navy-700 hover:underline">Editar</button>
                  <button onClick={() => borrar(c.id)} className="ml-4 font-bold text-red-600 hover:underline">Eliminar</button>
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={esGestion ? 6 : 7} className="px-5 py-8 text-center font-medium text-navy-400">Sin registros. Añade el primero.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
