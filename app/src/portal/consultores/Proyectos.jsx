import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, MODELO_IDS, calcular, fmtEUR } from '../../lib/calcEngine.js';
import { useAuth } from '../../lib/auth.jsx';

const ESTADOS = ['implantación', 'activo', 'pausado', 'cerrado'];
const COLOR_ESTADO = { activo: 'bg-green-100 text-green-800', 'implantación': 'bg-brand-orange/20 text-brand-orangeDark', pausado: 'bg-navy-100 text-navy-500', cerrado: 'bg-navy-50 text-navy-300' };
const VACIO = { cliente_id: '', normas: ['9001'], modelo: 'Implicación', consultor_id: '', estado: 'implantación', fecha_inicio: '', fecha_auditoria: '', notas: '' };

export default function Proyectos() {
  const { verEconomico } = useAuth();
  const [proyectos, setProyectos] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => Promise.all([listTable('proyectos'), listTable('clientes'), listTable('consultores')])
    .then(([p, cl, co]) => { setProyectos(p); setClientes(cl); setConsultores(co); })
    .catch(() => setProyectos([]));
  useEffect(() => { load(); }, []);

  // Cálculo en vivo del formulario
  const calc = useMemo(() => form?.normas?.length ? calcular(form.normas, form.modelo) : null, [form?.normas, form?.modelo]);

  // Filtrado inteligente: solo consultores activos que dominan TODAS las normas del proyecto
  const consultoresAptos = useMemo(() => {
    if (!form?.normas?.length) return consultores.filter(c => c.activo);
    return consultores.filter(c => c.activo && form.normas.every(n => (c.normas || []).includes(n)));
  }, [consultores, form?.normas]);

  async function guardar(e) {
    e.preventDefault(); setErr(null);
    if (!form.normas.length) { setErr('Selecciona al menos una norma.'); return; }
    const payload = {
      cliente_id: form.cliente_id || null,
      normas: form.normas, modelo: form.modelo,
      consultor_id: form.consultor_id || null,
      estado: form.estado,
      fecha_inicio: form.fecha_inicio || null,
      fecha_auditoria: form.fecha_auditoria || null,
      notas: form.notas,
      h_total_mes: calc?.tipo === 'mes' ? calc.hTotal : null,
      precio_mes: calc?.tipo === 'mes' ? calc.precioCatalogo : null,
      precio_total: calc?.tipo === 'bolsa' ? calc.precioCatalogo : null,
    };
    try {
      if (form.id) await updateRow('proyectos', form.id, payload);
      else await insertRow('proyectos', payload);
      setForm(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Eliminar este proyecto?')) return;
    await deleteRow('proyectos', id); load();
  }

  if (!proyectos) return <p className="font-semibold text-navy-400">Cargando…</p>;

  const nombreCliente = id => clientes.find(c => c.id === id)?.empresa || '—';
  const nombreConsultor = id => consultores.find(c => c.id === id)?.nombre || 'Sin asignar';

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setForm({ ...VACIO })} className="btn-orange">+ Nuevo proyecto</button>
      </div>

      {form && (
        <form onSubmit={guardar} className="card space-y-5">
          <h3 className="font-extrabold">{form.id ? 'Editar proyecto' : 'Nuevo proyecto'} <span className="ml-2 text-sm font-semibold text-navy-300">la calculadora aplica el catálogo v2026</span></h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-cliente">Cliente</label>
              <select id="p-cliente" required className="input" value={form.cliente_id} onChange={e => setForm({ ...form, cliente_id: e.target.value })}>
                <option value="">— Selecciona —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="p-modelo">Modelo</label>
              <select id="p-modelo" className="input" value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })}>
                {MODELO_IDS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="label">Normas del proyecto <span className="normal-case text-navy-300">(ISO 9001 siempre incluida)</span></p>
            <div className="flex flex-wrap gap-2">
              {NORMAS.map(n => {
                const on = form.normas.includes(n.id);
                const fija = n.id === '9001';
                return (
                  <button type="button" key={n.id} aria-disabled={fija}
                    onClick={() => { if (fija) return; setForm({ ...form, normas: on ? form.normas.filter(x => x !== n.id) : [...form.normas, n.id], consultor_id: '' }); }}
                    className={`chip border transition ${fija ? 'border-navy-800 bg-navy-800 text-white cursor-default' : on ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
                    {n.nombre}{fija ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {calc && verEconomico && (
            <div className="rounded-2xl bg-navy-900 p-4 text-white">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                <p className="text-2xl font-extrabold">{fmtEUR(calc.precioCatalogo)}<span className="text-sm font-bold text-white/60">{calc.tipo === 'mes' ? '/mes' : ' único'}</span></p>
                <p className="font-semibold text-white/70">{calc.hTotal} h{calc.tipo === 'mes' ? '/mes' : ''} · J2 {calc.horas.J2} h · J3 {calc.horas.J3} h · Senior {calc.horas.Senior} h</p>
                <p className="font-semibold text-white/50">exacto {fmtEUR(calc.precioExacto)} · coste {fmtEUR(calc.coste)}</p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="p-consultor">Consultor {form.normas.length > 0 && <span className="normal-case text-navy-300">({consultoresAptos.length} aptos)</span>}</label>
              <select id="p-consultor" className="input" value={form.consultor_id} onChange={e => setForm({ ...form, consultor_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {consultoresAptos.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.nivel})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="p-estado">Estado</label>
              <select id="p-estado" className="input" value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                {ESTADOS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="p-inicio">Inicio</label><input id="p-inicio" type="date" className="input" value={form.fecha_inicio || ''} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
            <div><label className="label" htmlFor="p-audit">Auditoría externa</label><input id="p-audit" type="date" className="input" value={form.fecha_auditoria || ''} onChange={e => setForm({ ...form, fecha_auditoria: e.target.value })} /></div>
          </div>

          {form.modelo === 'Apoyo' && form.fecha_auditoria && diasHasta(form.fecha_auditoria) < 60 && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">⚠ Apoyo no es contratable a menos de 60 días de la auditoría externa ({diasHasta(form.fecha_auditoria)} días). Cambia el modelo o la fecha.</p>
          )}

          <div><label className="label" htmlFor="p-notas">Notas</label><textarea id="p-notas" rows="2" className="input" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>

          {err && <p className="text-sm font-bold text-red-600">{err}</p>}
          <div className="flex gap-3">
            <button className="btn-primary" disabled={form.modelo === 'Apoyo' && form.fecha_auditoria && diasHasta(form.fecha_auditoria) < 60}>Guardar</button>
            <button type="button" onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead><tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-300">
            <th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Normas</th><th className="px-5 py-3">Modelo</th><th className="px-5 py-3">Consultor</th><th className="px-5 py-3">Estado</th>{verEconomico && <th className="px-5 py-3 text-right">Precio</th>}<th className="px-5 py-3 text-right">Acciones</th>
          </tr></thead>
          <tbody className="divide-y divide-navy-50">
            {proyectos.map(p => (
              <tr key={p.id}>
                <td className="px-5 py-3 font-extrabold">{nombreCliente(p.cliente_id)}</td>
                <td className="px-5 py-3 font-medium text-navy-400">{(p.normas || []).map(id => NORMA_BY_ID[id]?.nombre || id).join(' + ')}</td>
                <td className="px-5 py-3 font-semibold">{p.modelo}</td>
                <td className="px-5 py-3 font-medium">{nombreConsultor(p.consultor_id)}</td>
                <td className="px-5 py-3"><span className={`chip ${COLOR_ESTADO[p.estado] || COLOR_ESTADO.pausado}`}>{p.estado}</span></td>
                {verEconomico && <td className="px-5 py-3 text-right font-extrabold">{p.precio_mes ? `${fmtEUR(p.precio_mes)}/mes` : p.precio_total ? fmtEUR(p.precio_total) : '—'}</td>}
                <td className="px-5 py-3 text-right">
                  <button onClick={() => setForm({ ...VACIO, ...p, normas: [...new Set(['9001', ...(p.normas || [])])], consultor_id: p.consultor_id || '', cliente_id: p.cliente_id || '' })} className="font-bold text-navy-700 hover:underline">Editar</button>
                  <button onClick={() => borrar(p.id)} className="ml-4 font-bold text-red-600 hover:underline">Eliminar</button>
                </td>
              </tr>
            ))}
            {!proyectos.length && <tr><td colSpan="7" className="px-5 py-8 text-center font-medium text-navy-400">Sin proyectos todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function diasHasta(fecha) {
  return Math.ceil((new Date(fecha) - new Date()) / 86400000);
}
