import { useEffect, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';

const VACIO = { empresa: '', cif: '', contacto: '', email: '', telefono: '' };

export default function Clientes() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => listTable('clientes').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  async function guardar(e) {
    e.preventDefault(); setErr(null);
    try {
      if (form.id) await updateRow('clientes', form.id, { empresa: form.empresa, cif: form.cif, contacto: form.contacto, email: form.email, telefono: form.telefono });
      else await insertRow('clientes', form);
      setForm(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Eliminar este cliente? Sus proyectos quedarán huérfanos.')) return;
    await deleteRow('clientes', id); load();
  }

  if (!rows) return <p className="font-semibold text-navy-400">Cargando…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy-400">El email del cliente le da acceso a su zona privada cuando se registra con él.</p>
        <button onClick={() => setForm({ ...VACIO })} className="btn-orange">+ Añadir cliente</button>
      </div>

      {form && (
        <form onSubmit={guardar} className="card space-y-4">
          <h3 className="font-extrabold">{form.id ? `Editar · ${form.empresa}` : 'Nuevo cliente'}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="label" htmlFor="c-empresa">Empresa</label><input id="c-empresa" required className="input" value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-cif">CIF</label><input id="c-cif" className="input" value={form.cif} onChange={e => setForm({ ...form, cif: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-contacto">Persona de contacto</label><input id="c-contacto" className="input" value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-email">Email</label><input id="c-email" type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-tel">Teléfono</label><input id="c-tel" className="input" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
          </div>
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
            <th className="px-5 py-3">Empresa</th><th className="px-5 py-3">CIF</th><th className="px-5 py-3">Contacto</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Teléfono</th><th className="px-5 py-3 text-right">Acciones</th>
          </tr></thead>
          <tbody className="divide-y divide-navy-50">
            {rows.map(c => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-extrabold">{c.empresa}</td>
                <td className="px-5 py-3 font-medium text-navy-400">{c.cif || '—'}</td>
                <td className="px-5 py-3 font-medium">{c.contacto || '—'}</td>
                <td className="px-5 py-3 font-medium text-navy-400">{c.email || '—'}</td>
                <td className="px-5 py-3 font-medium text-navy-400">{c.telefono || '—'}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => setForm({ ...VACIO, ...c })} className="font-bold text-navy-700 hover:underline">Editar</button>
                  <button onClick={() => borrar(c.id)} className="ml-4 font-bold text-red-600 hover:underline">Eliminar</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="6" className="px-5 py-8 text-center font-medium text-navy-400">Sin clientes todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
