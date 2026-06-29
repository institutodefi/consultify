import { useEffect, useState } from 'react';
import { listAll } from '../../lib/data.js';
import { NORMA_BY_ID, fmtEUR } from '../../lib/calcEngine.js';

// Histórico interno de ofertas (todas las del equipo).
export default function Ofertas() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [genId, setGenId] = useState(null);

  useEffect(() => { listAll('presupuestos', 'creado').then(setRows).catch(() => setRows([])); }, []);

  async function generar(r) {
    setGenId(r.id);
    try {
      const resp = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas: r.normas, modelo: r.modelo,
          empresa: r.empresa || '', contacto: r.nombre || '', cif: r.cif || '', cargo: r.cargo || '',
          ref: r.numero_oferta || '', comercial: r.comercial || 'Alejandro',
          email: r.email || '', presupuesto_id: r.id,
        }),
      });
      const j = await resp.json();
      if (j.ok) setRows(rs => rs.map(x => x.id === r.id ? { ...x, url_pdf: j.url_pdf, url_pptx: j.url_pptx, numero_oferta: j.numero_oferta || x.numero_oferta } : x));
    } catch { /* sin bloquear */ }
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
                  <td className="py-2.5 font-semibold">{(r.normas || []).map(id => NORMA_BY_ID[id]?.nombre || id).join(' + ')}</td>
                  <td className="py-2.5 font-semibold">{r.modelo}</td>
                  <td className="py-2.5 text-right font-extrabold">{fmtEUR(r.precio)}{r.tipo === 'mes' ? '/mes' : ''}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    {(r.url_pdf || r.url_pptx) ? (
                      <span className="inline-flex gap-2">
                        {r.url_pdf && <a href={r.url_pdf} target="_blank" rel="noreferrer" className="font-bold text-brand-orangeDark hover:underline">PDF</a>}
                        {r.url_pptx && <a href={r.url_pptx} target="_blank" rel="noreferrer" className="font-bold text-brand-orangeDark hover:underline">PPT</a>}
                        <button onClick={() => generar(r)} disabled={genId === r.id} className="text-xs font-semibold text-navy-400 hover:underline disabled:opacity-50">{genId === r.id ? '…' : '↻'}</button>
                      </span>
                    ) : (
                      <button onClick={() => generar(r)} disabled={genId === r.id} className="text-xs font-bold text-navy-700 hover:underline disabled:opacity-50">
                        {genId === r.id ? 'Generando…' : 'Generar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
