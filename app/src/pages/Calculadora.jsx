import { useMemo, useState } from 'react';
import { NORMAS, MODELOS, MODELO_IDS, calcular, compararModelos, fmtEUR, ACOMPANAMIENTO_AUDITORIA_DIA } from '../lib/calcEngine.js';
import { insertRow } from '../lib/data.js';
import { useAuth } from '../lib/auth.jsx';

const PASOS = ['Normas', 'Modelo', 'Tu precio'];

export default function Calculadora() {
  const { user } = useAuth();
  const [paso, setPaso] = useState(0);
  const [sel, setSel] = useState([]);
  const [modelo, setModelo] = useState('Implicación');
  const [comparar, setComparar] = useState(false);
  const [lead, setLead] = useState({ nombre: '', empresa: '', email: user?.email || '', telefono: '', consent: false });
  const [leadState, setLeadState] = useState('idle'); // idle | sending | ok | error

  const res = useMemo(() => sel.length ? calcular(sel, modelo) : null, [sel, modelo]);
  const comparativa = useMemo(() => sel.length ? compararModelos(sel) : [], [sel]);

  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  async function enviarLead(e) {
    e.preventDefault();
    if (!lead.consent || !res) return;
    setLeadState('sending');
    try {
      // 1) Guardar presupuesto en Supabase (o demo)
      await insertRow('presupuestos', {
        email: lead.email, nombre: lead.nombre, empresa: lead.empresa, telefono: lead.telefono,
        normas: sel, modelo, precio: res.precioCatalogo, tipo: res.tipo,
        ...(user?.id && user.id !== 'demo' ? { user_id: user.id } : {}),
      });
      // 2) Enviar a Brevo vía Netlify Function (la API key vive en el servidor)
      const r = await fetch('/.netlify/functions/brevo-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, normas: sel, modelo, precio: res.precioCatalogo, tipo: res.tipo }),
      });
      if (!r.ok && r.status !== 404) throw new Error('brevo');
      setLeadState('ok');
    } catch {
      setLeadState('error');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-orangeDark">Calculadora de precios</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Tu sistema de gestión, con precio cerrado en 60 segundos</h1>
        <p className="mt-3 text-navy-400 font-medium">Elige tus normas, elige cuánto quieres que hagamos nosotros, y mira el precio. Sin sorpresas: lo que ves es lo que firmas.</p>
      </div>

      {/* Pasos */}
      <ol className="mb-8 flex gap-2">
        {PASOS.map((p, i) => (
          <li key={p} className="flex-1">
            <button onClick={() => i < paso && setPaso(i)}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition ${i === paso ? 'bg-navy-800 text-white' : i < paso ? 'bg-navy-100 text-navy-700' : 'bg-white text-navy-300 border border-navy-100'}`}>
              <span className="mr-2 opacity-60">{i + 1}</span>{p}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          {paso === 0 && (
            <section>
              <h2 className="mb-4 text-lg font-extrabold">¿Qué normas necesitas?</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {NORMAS.map(n => {
                  const on = sel.includes(n.id);
                  return (
                    <button key={n.id} onClick={() => toggle(n.id)}
                      className={`card text-left transition ${on ? '!border-brand-orange ring-2 ring-brand-orange/30' : 'hover:border-navy-300'}`}>
                      <div className="flex items-start justify-between">
                        <span className="font-extrabold">{n.nombre}</span>
                        <span className={`chip ${on ? 'bg-brand-orange text-navy-900' : 'bg-navy-50 text-navy-300'}`}>{on ? '✓' : '+'}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-navy-400">{n.desc}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6">
                <button disabled={!sel.length} onClick={() => setPaso(1)} className="btn-orange">Continuar →</button>
              </div>
            </section>
          )}

          {paso === 1 && (
            <section>
              <h2 className="mb-4 text-lg font-extrabold">¿Qué nivel de servicio quieres?</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {MODELO_IDS.map(mid => {
                  const m = MODELOS[mid];
                  const on = modelo === mid;
                  const r = calcular(sel, mid);
                  return (
                    <button key={mid} onClick={() => setModelo(mid)}
                      className={`card relative text-left transition ${on ? '!border-brand-orange ring-2 ring-brand-orange/30' : 'hover:border-navy-300'}`}>
                      {m.destacado && <span className="absolute -top-2 right-4 chip bg-navy-800 text-white">Recomendado</span>}
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-lg font-extrabold">{m.titulo}</span>
                        <span className="font-extrabold text-navy-800">{fmtEUR(r.precioCatalogo)}{r.tipo === 'mes' ? '/mes' : ' único'}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-brand-orangeDark">{m.claim}</p>
                      <p className="mt-2 text-xs font-medium leading-relaxed text-navy-400">{m.leyenda}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setPaso(0)} className="btn-ghost">← Normas</button>
                <button onClick={() => setPaso(2)} className="btn-orange">Ver mi precio →</button>
              </div>
            </section>
          )}

          {paso === 2 && res && (
            <section className="space-y-6">
              <div className="card">
                <h2 className="text-lg font-extrabold">Desglose de tu propuesta</h2>
                <table className="mt-4 w-full text-sm">
                  <tbody className="divide-y divide-navy-50">
                    <tr><td className="py-2 font-semibold text-navy-400">Normas</td><td className="py-2 text-right font-bold">{sel.map(id => NORMAS.find(n => n.id === id)?.nombre).join(' + ')}</td></tr>
                    <tr><td className="py-2 font-semibold text-navy-400">Modelo</td><td className="py-2 text-right font-bold">{modelo}</td></tr>
                    <tr><td className="py-2 font-semibold text-navy-400">Dedicación del equipo</td><td className="py-2 text-right font-bold">{res.hTotal} h{res.tipo === 'mes' ? '/mes' : ' totales'}</td></tr>
                    <tr><td className="py-2 font-semibold text-navy-400">Subtotal</td><td className="py-2 text-right font-bold">{fmtEUR(res.precioCatalogo)}</td></tr>
                    <tr><td className="py-2 font-semibold text-navy-400">IVA 21 %</td><td className="py-2 text-right font-bold">{fmtEUR(res.iva)}</td></tr>
                    <tr><td className="py-3 text-base font-extrabold">Total{res.tipo === 'mes' ? ' / mes' : ''}</td><td className="py-3 text-right text-base font-extrabold text-navy-800">{fmtEUR(res.totalConIva)}</td></tr>
                  </tbody>
                </table>
                <p className="mt-3 rounded-xl bg-navy-50 p-3 text-xs font-medium leading-relaxed text-navy-700">{res.leyenda} Acompañamiento a auditoría: {fmtEUR(ACOMPANAMIENTO_AUDITORIA_DIA)}/jornada, siempre aparte.</p>
                <button onClick={() => setComparar(c => !c)} className="mt-4 text-sm font-bold text-brand-orangeDark hover:underline">
                  {comparar ? 'Ocultar comparativa' : 'Comparar los 5 modelos →'}
                </button>
                {comparar && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead><tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                        <th className="py-2">Modelo</th><th className="py-2">Dedicación</th><th className="py-2 text-right">Precio catálogo</th>
                      </tr></thead>
                      <tbody className="divide-y divide-navy-50">
                        {comparativa.map(c => (
                          <tr key={c.modelo} className={c.modelo === modelo ? 'bg-brand-orange/10' : ''}>
                            <td className="py-2 font-bold">{c.modelo}</td>
                            <td className="py-2 font-medium text-navy-400">{c.hTotal} h{c.tipo === 'mes' ? '/mes' : ''}</td>
                            <td className="py-2 text-right font-extrabold">{fmtEUR(c.precioCatalogo)}{c.tipo === 'mes' ? '/mes' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Lead → Brevo */}
              <div className="card">
                {leadState === 'ok' ? (
                  <div className="py-4 text-center">
                    <p className="text-2xl">✅</p>
                    <h3 className="mt-2 text-lg font-extrabold">Propuesta guardada</h3>
                    <p className="mt-1 text-sm font-medium text-navy-400">Te llamamos en menos de 24 h laborables para cerrar los detalles.</p>
                  </div>
                ) : (
                  <form onSubmit={enviarLead}>
                    <h3 className="text-lg font-extrabold">Quiero esta propuesta — llamadme</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div><label className="label" htmlFor="l-nombre">Nombre</label><input id="l-nombre" required className="input" value={lead.nombre} onChange={e => setLead({ ...lead, nombre: e.target.value })} /></div>
                      <div><label className="label" htmlFor="l-empresa">Empresa</label><input id="l-empresa" required className="input" value={lead.empresa} onChange={e => setLead({ ...lead, empresa: e.target.value })} /></div>
                      <div><label className="label" htmlFor="l-email">Email</label><input id="l-email" type="email" required className="input" value={lead.email} onChange={e => setLead({ ...lead, email: e.target.value })} /></div>
                      <div><label className="label" htmlFor="l-tel">Teléfono</label><input id="l-tel" className="input" value={lead.telefono} onChange={e => setLead({ ...lead, telefono: e.target.value })} /></div>
                    </div>
                    <label className="mt-4 flex items-start gap-2 text-xs font-medium text-navy-400">
                      <input type="checkbox" checked={lead.consent} onChange={e => setLead({ ...lead, consent: e.target.checked })} className="mt-0.5" />
                      <span>Acepto que Instituto de Excelencia Europea S.L. trate mis datos para contactarme sobre esta propuesta (RGPD). Puedo retirar el consentimiento en cualquier momento.</span>
                    </label>
                    {leadState === 'error' && <p className="mt-2 text-sm font-bold text-red-600">No se pudo enviar. Revisa la conexión e inténtalo de nuevo.</p>}
                    <div className="mt-5 flex gap-3">
                      <button type="button" onClick={() => setPaso(1)} className="btn-ghost">← Modelo</button>
                      <button type="submit" disabled={!lead.consent || leadState === 'sending'} className="btn-orange">
                        {leadState === 'sending' ? 'Enviando…' : 'Recibir propuesta en 24 h'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Panel de precio en vivo */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="rounded-2xl bg-navy-900 p-6 text-white shadow-xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-orange">Tu precio en vivo</p>
            {res ? (
              <>
                <p className="mt-3 text-4xl font-extrabold tracking-tight">{fmtEUR(res.precioCatalogo)}<span className="text-base font-bold text-white/60">{res.tipo === 'mes' ? ' /mes' : ' pago único'}</span></p>
                <p className="mt-1 text-sm font-semibold text-white/70">{fmtEUR(res.totalConIva)} con IVA</p>
                <div className="mt-4 space-y-1.5 text-sm font-medium text-white/80">
                  <p>{res.nSistemas} sistema{res.nSistemas > 1 ? 's' : ''} · modelo {modelo}</p>
                  <p>{res.hTotal} h de consultor{res.tipo === 'mes' ? ' cada mes' : ''}</p>
                </div>
              </>
            ) : (
              <p className="mt-3 font-semibold text-white/60">Selecciona al menos una norma para ver el precio.</p>
            )}
            <div className="mt-5 border-t border-white/15 pt-4 text-xs font-medium leading-relaxed text-white/50">
              Precio de catálogo. Suelo de 350 €/mes en modelos recurrentes. Apoyo no contratable a &lt;60 días de auditoría externa.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
