import { useEffect, useState } from 'react';
import { listAll, updateRow, deleteRow } from '../../lib/data.js';
import { useAuth } from '../../lib/auth.jsx';
import { NORMA_BY_ID, NORMAS, fmtEUR } from '../../lib/calcEngine.js';

// Histórico interno de ofertas (todas las del equipo).
export default function Ofertas() {
  const { role } = useAuth();
  const puedeBorrar = role === 'superadmin' || role === 'admin'; // solo administradores
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [genId, setGenId] = useState(null);
  const [editNormas, setEditNormas] = useState(null); // { oferta, normas:[] } cuando se editan normas

  useEffect(() => { listAll('presupuestos', 'creado').then(setRows).catch(() => setRows([])); }, []);

  const [msg, setMsg] = useState(null);

  async function generar(r) {
    setGenId(r.id); setMsg(null);
    try {
      const resp = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas: r.normas, modelo: r.modelo, meses: r.meses,
          empresa: r.empresa || '', contacto: r.nombre || '', cif: r.cif || '', cargo: r.cargo || '',
          ref: r.numero_oferta || '', comercial: r.comercial || 'Alejandro',
          email: r.email || '', presupuesto_id: r.id,
        }),
      });
      let j = null; try { j = await resp.json(); } catch { j = null; }
      if (j && j.ok) {
        setRows(rs => rs.map(x => x.id === r.id ? { ...x, url_pdf: j.url_pdf, url_pptx: j.url_pptx, numero_oferta: j.numero_oferta || x.numero_oferta } : x));
        setMsg(`✓ Oferta ${j.numero_oferta || r.numero_oferta} generada. PDF y PPT listos.`);
      } else {
        setMsg(`No se pudo generar la oferta (${j?.error || `código ${resp.status}`}).`);
      }
    } catch (e) { setMsg('Error de conexión al generar la oferta.'); }
    setGenId(null);
  }

  // ETAPA 2: enviar la oferta YA generada (sin regenerar el documento).
  async function enviar(r) {
    if (!r.email) { setMsg('Esta oferta no tiene email de cliente; edítala para añadirlo.'); return; }
    if (!r.url_pdf) { setMsg('Genera primero la oferta (no hay PDF que enviar).'); return; }
    if (!window.confirm(`¿Enviar la oferta ${r.numero_oferta || ''} a ${r.email}?`)) return;
    setGenId(r.id); setMsg(null);
    try {
      const resp = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enviar_existente',
          url_pdf: r.url_pdf, email: r.email, empresa: r.empresa || '', contacto: r.nombre || '',
          comercial: r.comercial || 'Alejandro', numero_oferta: r.numero_oferta || '', normas: r.normas || [],
        }),
      });
      let j = null; try { j = await resp.json(); } catch { j = null; }
      if (j && j.ok) setMsg(`✓ Oferta ${r.numero_oferta || ''} enviada a ${r.email}.`);
      else setMsg(`No se pudo enviar (${j?.error || `código ${resp.status}`}).`);
    } catch (e) { setMsg('Error de conexión al enviar.'); }
    setGenId(null);
  }

  // Borrar una oferta (solo administradores). Acción irreversible → doble confirmación.
  async function borrar(r) {
    if (!puedeBorrar) return;
    const etiqueta = `${r.numero_oferta || 'sin nº'} · ${r.empresa || 'sin empresa'}`;
    if (!window.confirm(`¿Eliminar definitivamente la oferta ${etiqueta}?\n\nEsta acción no se puede deshacer.`)) return;
    setGenId(r.id); setMsg(null);
    try {
      await deleteRow('presupuestos', r.id);
      setRows(rs => rs.filter(x => x.id !== r.id));
      setMsg(`Oferta ${etiqueta} eliminada.`);
    } catch (e) {
      setMsg(`No se pudo eliminar la oferta: ${e?.message || e}`);
    }
    setGenId(null);
  }

  // Guarda las normas editadas en la oferta y la regenera con ellas.
  async function guardarNormasYRegenerar() {
    const { oferta, normas } = editNormas;
    if (!normas.includes('9001')) { setMsg('La ISO 9001 es la base obligatoria.'); return; }
    setEditNormas(null); setGenId(oferta.id); setMsg(null);
    try {
      await updateRow('presupuestos', oferta.id, { normas });
      setRows(rs => rs.map(x => x.id === oferta.id ? { ...x, normas } : x));
      const resp = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas, modelo: oferta.modelo, meses: oferta.meses,
          empresa: oferta.empresa || '', contacto: oferta.nombre || '', cif: oferta.cif || '', cargo: oferta.cargo || '',
          ref: oferta.numero_oferta || '', comercial: oferta.comercial || 'Alejandro',
          email: oferta.email || '', presupuesto_id: oferta.id,
        }),
      });
      let j = null; try { j = await resp.json(); } catch { j = null; }
      if (j && j.ok) {
        setRows(rs => rs.map(x => x.id === oferta.id ? { ...x, url_pdf: j.url_pdf, url_pptx: j.url_pptx } : x));
        setMsg(`✓ Oferta ${oferta.numero_oferta} regenerada con ${normas.length} norma(s).`);
      } else setMsg(`No se pudo regenerar (${j?.error || `código ${resp.status}`}).`);
    } catch (e) { setMsg('Error al regenerar con las nuevas normas.'); }
    setGenId(null);
  }

  if (!rows) return <p className="font-semibold text-navy-400">Cargando ofertas…</p>;

  const filtro = q.trim().toLowerCase();
  const lista = !filtro ? rows : rows.filter(r =>
    [r.numero_oferta, r.empresa, r.nombre, r.comercial, r.modelo].filter(Boolean).join(' ').toLowerCase().includes(filtro)
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold">Histórico de ofertas</h2>
          <p className="text-sm font-medium text-navy-400">{rows.length} oferta{rows.length !== 1 ? 's' : ''} emitida{rows.length !== 1 ? 's' : ''}.</p>
        </div>
        <input className="input max-w-xs" placeholder="Buscar nº, cliente, comercial…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {msg && <div className="mb-4 rounded-xl bg-navy-50 px-4 py-2.5 text-sm font-bold text-navy-700">{msg}</div>}

      {!lista.length ? (
        <div className="card text-center"><p className="font-extrabold">Sin ofertas{filtro ? ' para esa búsqueda' : ' todavía'}</p></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
              <th className="py-2">Nº oferta</th><th className="py-2">Fecha</th><th className="py-2">Cliente</th>
              <th className="py-2">Comercial</th><th className="py-2">Normas</th><th className="py-2">Modelo</th>
              <th className="py-2 text-right">Importe</th><th className="py-2 text-right">Documentos</th>
            </tr></thead>
            <tbody className="divide-y divide-navy-50">
              {lista.map(r => (
                <tr key={r.id}>
                  <td className="py-2.5 font-extrabold text-navy-800">{r.numero_oferta || '—'}</td>
                  <td className="py-2.5 font-medium text-navy-400">{(r.creado || '').slice(0, 10)}</td>
                  <td className="py-2.5 font-bold">{r.empresa || '—'}<br /><span className="text-xs font-medium text-navy-400">{r.nombre || ''}</span></td>
                  <td className="py-2.5 font-semibold">{r.comercial || 'Alejandro'}</td>
                  <td className="py-2.5 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {(r.normas || []).map(id => NORMA_BY_ID[id]?.nombre || id).join(' + ')}
                      <button onClick={() => setEditNormas({ oferta: r, normas: [...(r.normas || ['9001'])] })} className="text-xs font-bold text-navy-300 hover:text-brand-orangeDark" title="Editar normas y regenerar">✎</button>
                    </span>
                  </td>
                  <td className="py-2.5 font-semibold">{r.modelo}</td>
                  <td className="py-2.5 text-right font-extrabold">{fmtEUR(r.precio)}{r.tipo === 'mes' ? '/mes' : ''}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    {(r.url_pdf || r.url_pptx) ? (
                      <span className="inline-flex gap-2 items-center">
                        {r.url_pdf && <a href={r.url_pdf} target="_blank" rel="noreferrer" className="font-bold text-brand-orangeDark hover:underline">PDF</a>}
                        {r.url_pptx && <a href={r.url_pptx} target="_blank" rel="noreferrer" className="font-bold text-brand-orangeDark hover:underline">PPT</a>}
                        <button onClick={() => generar(r)} disabled={genId === r.id} className="text-xs font-semibold text-navy-400 hover:underline disabled:opacity-50" title="Regenerar documentos">{genId === r.id ? '…' : '↻ Regenerar'}</button>
                        <button onClick={() => enviar(r)} disabled={genId === r.id || !r.email} className="rounded-lg bg-brand-orange/15 px-2.5 py-1 text-xs font-bold text-brand-orangeDark hover:bg-brand-orange/25 disabled:opacity-40" title={r.email ? `Enviar a ${r.email}` : 'Sin email de cliente'}>✉ Enviar</button>
                      </span>
                    ) : (
                      <button onClick={() => generar(r)} disabled={genId === r.id} className="text-xs font-bold text-navy-700 hover:underline disabled:opacity-50">
                        {genId === r.id ? 'Generando…' : 'Generar'}
                      </button>
                    )}
                    {puedeBorrar && (
                      <button onClick={() => borrar(r)} disabled={genId === r.id}
                        className="ml-2 text-xs font-bold text-red-500 hover:text-red-700 hover:underline disabled:opacity-40"
                        title="Eliminar oferta (solo administradores)">🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: editar normas de una oferta y regenerar */}
      {editNormas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditNormas(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-navy-900">Normas de la oferta</h3>
            <p className="mt-1 text-sm font-medium text-navy-400">{editNormas.oferta.numero_oferta} · {editNormas.oferta.empresa}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {NORMAS.map(n => {
                const on = editNormas.normas.includes(n.id);
                const base = n.id === '9001';
                return (
                  <button key={n.id} disabled={base}
                    onClick={() => setEditNormas(s => ({ ...s, normas: on ? s.normas.filter(x => x !== n.id) : [...s.normas, n.id] }))}
                    className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${on ? 'border-brand-orange bg-brand-orange/10 text-navy-900' : 'border-navy-200 text-navy-400 hover:border-navy-300'} ${base ? 'opacity-70 cursor-default' : ''}`}>
                    {n.nombre}{base && <span className="block text-[10px] font-medium">base obligatoria</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditNormas(null)} className="rounded-xl px-4 py-2 text-sm font-bold text-navy-400 hover:bg-navy-50">Cancelar</button>
              <button onClick={guardarNormasYRegenerar} className="btn-orange !px-4 !py-2 !text-sm">Guardar y regenerar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
