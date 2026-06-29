import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { misProyectos, misPresupuestos } from '../lib/data.js';
import { NORMA_BY_ID, MODELOS, fmtEUR, ACOMPANAMIENTO_AUDITORIA_DIA } from '../lib/calcEngine.js';

const ESTADOS = { activo: 'bg-green-100 text-green-800', 'implantación': 'bg-brand-orange/20 text-brand-orangeDark', pausado: 'bg-navy-100 text-navy-500', cerrado: 'bg-navy-50 text-navy-300' };

function Servicios() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => { misProyectos(user).then(setRows).catch(() => setRows([])); }, [user]);
  if (!rows) return <p className="font-semibold text-navy-400">Cargando…</p>;
  if (!rows.length) return (
    <div className="card text-center">
      <p className="text-lg font-extrabold">Aún no tienes servicios activos</p>
      <p className="mt-1 text-sm font-medium text-navy-400">Calcula tu propuesta y te llamamos en 24 h.</p>
      <a href="/app/calculadora" className="btn-orange mt-4">Ir a la calculadora</a>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map(p => (
        <div key={p.id} className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-extrabold">{(p.normas || []).map(id => NORMA_BY_ID[id]?.nombre || id).join(' + ')}</p>
              <p className="mt-0.5 text-sm font-semibold text-brand-orangeDark">Modelo {p.modelo}</p>
            </div>
            <span className={`chip ${ESTADOS[p.estado] || ESTADOS.pausado}`}>{p.estado}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><p className="label !mb-0">Cuota</p><p className="font-extrabold">{p.precio_mes ? `${fmtEUR(p.precio_mes)}/mes` : p.precio_total ? `${fmtEUR(p.precio_total)} único` : '—'}</p></div>
            <div><p className="label !mb-0">Inicio</p><p className="font-bold">{p.fecha_inicio || '—'}</p></div>
            <div className="col-span-2"><p className="label !mb-0">Próxima auditoría</p><p className="font-bold">{p.fecha_auditoria || 'Sin programar'}</p></div>
          </div>
          {p.modelo !== 'Apoyo' && <p className="mt-3 text-xs font-medium text-navy-400">{MODELOS[p.modelo]?.claim}</p>}
        </div>
      ))}
    </div>
  );
}

function Presupuestos() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [genId, setGenId] = useState(null); // id en generación
  useEffect(() => { misPresupuestos(user).then(setRows).catch(() => setRows([])); }, [user]);

  async function generar(r) {
    setGenId(r.id);
    try {
      const resp = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas: r.normas, modelo: r.modelo,
          empresa: r.empresa || '', contacto: r.nombre || '',
          ref: `OFE-${String(r.id).slice(0, 8)}`,
          presupuesto_id: r.id,
        }),
      });
      const j = await resp.json();
      if (j.ok) {
        setRows(rs => rs.map(x => x.id === r.id ? { ...x, url_pdf: j.url_pdf, url_pptx: j.url_pptx } : x));
      }
    } catch { /* sin bloquear */ }
    setGenId(null);
  }

  if (!rows) return <p className="font-semibold text-navy-400">Cargando…</p>;
  if (!rows.length) return <div className="card text-center"><p className="font-extrabold">No tienes presupuestos guardados</p><a href="/app/calculadora" className="btn-orange mt-4">Calcular uno ahora</a></div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead><tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
          <th className="py-2">Fecha</th><th className="py-2">Normas</th><th className="py-2">Modelo</th><th className="py-2 text-right">Precio</th><th className="py-2 text-right">Oferta</th>
        </tr></thead>
        <tbody className="divide-y divide-navy-50">
          {rows.map(r => (
            <tr key={r.id}>
              <td className="py-2.5 font-medium text-navy-400">{(r.creado || '').slice(0, 10)}</td>
              <td className="py-2.5 font-bold">{(r.normas || []).map(id => NORMA_BY_ID[id]?.nombre || id).join(' + ')}</td>
              <td className="py-2.5 font-semibold">{r.modelo}</td>
              <td className="py-2.5 text-right font-extrabold">{fmtEUR(r.precio)}{r.tipo === 'mes' ? '/mes' : ''}</td>
              <td className="py-2.5 text-right whitespace-nowrap">
                {(r.url_pdf || r.url_pptx) ? (
                  <span className="inline-flex gap-2">
                    {r.url_pdf && <a href={r.url_pdf} target="_blank" rel="noreferrer" className="font-bold text-brand-orangeDark hover:underline">PDF</a>}
                    {r.url_pptx && <a href={r.url_pptx} target="_blank" rel="noreferrer" className="font-bold text-brand-orangeDark hover:underline">PPT</a>}
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
  );
}

function Soporte() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h3 className="font-extrabold">Tu consultor, a un mensaje</h3>
        <p className="mt-2 text-sm font-medium text-navy-400">Escríbenos y te respondemos en el mismo día laborable.</p>
        <a href="mailto:hola@consultify.pro" className="btn-primary mt-4">hola@consultify.pro</a>
      </div>
      <div className="card">
        <h3 className="font-extrabold">Acompañamiento a auditoría</h3>
        <p className="mt-2 text-sm font-medium text-navy-400">Un consultor a tu lado el día de la auditoría externa: {fmtEUR(ACOMPANAMIENTO_AUDITORIA_DIA)}/jornada. Resérvalo con al menos 15 días.</p>
      </div>
    </div>
  );
}

export default function ClientePortal() {
  const tabs = [
    { to: '', end: true, label: 'Mis servicios' },
    { to: 'presupuestos', label: 'Mis presupuestos' },
    { to: 'soporte', label: 'Soporte' },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <p className="eyebrow">Tu espacio Consultify</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Zona de clientes</h1>
      <nav className="mt-6 flex gap-6 border-b border-navy-100 text-sm">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({isActive}) => `pb-3 ${isActive ? 'tab-active' : 'tab-idle'}`}>{t.label}</NavLink>
        ))}
      </nav>
      <div className="mt-8">
        <Routes>
          <Route index element={<Servicios />} />
          <Route path="presupuestos" element={<Presupuestos />} />
          <Route path="soporte" element={<Soporte />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </div>
    </div>
  );
}
