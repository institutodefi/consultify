import { useMemo, useState } from 'react';
import { NORMAS, MODELOS, MODELO_IDS, calcular, compararModelos, fmtEUR, ACOMPANAMIENTO_AUDITORIA_DIA } from '../lib/calcEngine.js';
import { insertRow, siguienteNumeroOferta } from '../lib/data.js';
import { useAuth } from '../lib/auth.jsx';

const PASOS = ['Normas', 'Modelo', 'Tu precio'];

export default function Calculadora() {
  const { user } = useAuth();
  const [paso, setPaso] = useState(0);
  // ISO 9001 es la base de todo sistema de gestión: siempre incluida, no deseleccionable
  const [sel, setSel] = useState(['9001']);
  const [modelo, setModelo] = useState('Implicación');
  const [comparar, setComparar] = useState(false);
  const [lead, setLead] = useState({ nombre: '', apellidos: '', empresa: '', cif: '', cargo: '', email: user?.email || '', telefono: '', consent: false });
  const [leadState, setLeadState] = useState('idle'); // idle | sending | ok | error

  const res = useMemo(() => sel.length ? calcular(sel, modelo) : null, [sel, modelo]);
  const comparativa = useMemo(() => sel.length ? compararModelos(sel) : [], [sel]);

  const toggle = (id) => {
    if (id === '9001') return; // base obligatoria de todo sistema de gestión
    setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  async function enviarLead(e) {
    e.preventDefault();
    if (!lead.consent || !res) return;
    setLeadState('sending');
    try {
      // Para Implantación el "precio" relevante es el total fraccionado (sin IVA).
      const precioLead = res.fraccionado ? res.fraccionado.totalSinIva : res.precioCatalogo;
      const tipoLead = res.fraccionado ? 'fraccionado' : res.tipo;
      // Número de oferta correlativo limpio (OFE-AAAA-NNN), asignado atómicamente en Postgres
      const numeroOferta = await siguienteNumeroOferta();
      const comercial = 'Alejandro'; // Comercial 1 por defecto
      const contactoCompleto = `${lead.nombre} ${lead.apellidos}`.trim();
      // Resumen legible del requerimiento para el comercial (CRM)
      const nombresNormas = sel.map((id) => NORMAS.find((n) => n.id === id)?.nombre || id).join(' + ');
      const sufijo = tipoLead === 'mes' ? ' €/mes' : (tipoLead === 'fraccionado' ? ' € (proyecto)' : ' € (único)');
      const requerimiento = `${nombresNormas} · Modelo ${modelo} · ${precioLead}${sufijo}`;
      // 1) Guardar presupuesto en Supabase (o demo)
      const filaPresupuesto = await insertRow('presupuestos', {
        email: lead.email, nombre: contactoCompleto, empresa: lead.empresa, telefono: lead.telefono,
        cif: lead.cif, cargo: lead.cargo, numero_oferta: numeroOferta, comercial,
        normas: sel, modelo, precio: precioLead, tipo: tipoLead, requerimiento,
        ...(user?.id && user.id !== 'demo' ? { user_id: user.id } : {}),
      });
      // 2) Enviar a Brevo vía Netlify Function (la API key vive en el servidor)
      const r = await fetch('/.netlify/functions/brevo-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...lead, nombre: contactoCompleto, normas: sel, modelo, precio: precioLead, tipo: tipoLead,
          numero_oferta: numeroOferta, comercial,
        }),
      });
      if (!r.ok && r.status !== 404) throw new Error('brevo');
      // 3) Generar automáticamente la oferta (PDF + PPTX) y guardar las URLs.
      //    No bloquea el éxito del lead: si falla, el comercial puede regenerarla a mano.
      fetch('/.netlify/functions/generar-oferta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas: sel, modelo,
          empresa: lead.empresa, contacto: contactoCompleto, cif: lead.cif, cargo: lead.cargo,
          ref: numeroOferta, comercial,
          presupuesto_id: filaPresupuesto?.id,
        }),
      }).catch(() => {});
      setLeadState('ok');
    } catch {
      setLeadState('error');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 max-w-2xl">
        <p className="eyebrow">Calculadora de precios</p>
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
              <p className="mb-4 text-sm font-medium text-navy-400">ISO 9001 es la columna vertebral de todo sistema de gestión Consultify: va siempre incluida. Añade las normas que quieras integrar sobre ella.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {NORMAS.map(n => {
                  const on = sel.includes(n.id);
                  const fija = n.id === '9001';
                  return (
                    <button key={n.id} onClick={() => toggle(n.id)} aria-disabled={fija}
                      className={`card text-left transition ${on ? '!border-brand-orange ring-2 ring-brand-orange/30' : 'hover:border-navy-300'} ${fija ? 'cursor-default' : ''}`}>
                      <div className="flex items-start justify-between">
                        <span className="font-extrabold">{n.nombre}</span>
                        <span className={`chip ${fija ? 'bg-navy-800 text-white' : on ? 'bg-brand-orange text-navy-900' : 'bg-navy-50 text-navy-300'}`}>{fija ? 'Incluida siempre' : on ? '✓' : '+'}</span>
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
                        <span className="font-extrabold text-navy-800">
                          {r?.fraccionado
                            ? <>{fmtEUR(r.fraccionado.totalConIva)} <span className="text-xs font-bold text-navy-400">total</span></>
                            : <>{fmtEUR(r.precioCatalogo)}{r.tipo === 'mes' ? '/mes' : ' único'}</>}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-brand-orangeDark">
                        {r?.fraccionado
                          ? `50% al inicio (${fmtEUR(r.fraccionado.cuota1)}) · 50% antes de auditoría (${fmtEUR(r.fraccionado.cuota2)})`
                          : m.claim}
                      </p>
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
                    {modelo !== 'Implantación' && (
                      <tr><td className="py-2 font-semibold text-navy-400">Dedicación del equipo</td><td className="py-2 text-right font-bold">{res.hTotal} h{res.tipo === 'mes' ? '/mes' : ' totales'}</td></tr>
                    )}
                    {res.fraccionado ? (
                      <>
                        <tr><td className="py-2 font-semibold text-navy-400">Duración implantación</td><td className="py-2 text-right font-bold">{res.fraccionado.meses} meses</td></tr>
                        <tr><td className="py-2 font-semibold text-navy-400">Subtotal</td><td className="py-2 text-right font-bold">{fmtEUR(res.fraccionado.totalSinIva)}</td></tr>
                        <tr><td className="py-2 font-semibold text-navy-400">IVA 21 %</td><td className="py-2 text-right font-bold">{fmtEUR(res.fraccionado.totalConIva - res.fraccionado.totalSinIva)}</td></tr>
                        <tr><td className="py-3 text-base font-extrabold">Total</td><td className="py-3 text-right text-base font-extrabold text-navy-800">{fmtEUR(res.fraccionado.totalConIva)}</td></tr>
                        <tr><td className="py-2 font-semibold text-navy-400">50% por adelantado</td><td className="py-2 text-right font-bold">{fmtEUR(res.fraccionado.cuota1)}</td></tr>
                        <tr><td className="py-2 font-semibold text-navy-400">50% antes de auditoría externa</td><td className="py-2 text-right font-bold">{fmtEUR(res.fraccionado.cuota2)}</td></tr>
                      </>
                    ) : (
                      <>
                        <tr><td className="py-2 font-semibold text-navy-400">Subtotal</td><td className="py-2 text-right font-bold">{fmtEUR(res.precioCatalogo)}</td></tr>
                        <tr><td className="py-2 font-semibold text-navy-400">IVA 21 %</td><td className="py-2 text-right font-bold">{fmtEUR(res.iva)}</td></tr>
                        <tr><td className="py-3 text-base font-extrabold">Total{res.tipo === 'mes' ? ' / mes' : ''}</td><td className="py-3 text-right text-base font-extrabold text-navy-800">{fmtEUR(res.totalConIva)}</td></tr>
                      </>
                    )}
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
                            <td className="py-2 font-medium text-navy-400">{c.modelo === 'Implantación' ? '—' : <>{c.hTotal} h{c.tipo === 'mes' ? '/mes' : ''}</>}</td>
                            <td className="py-2 text-right font-extrabold">{c.fraccionado ? <>{fmtEUR(c.fraccionado.totalConIva)} <span className="text-[11px] font-medium text-navy-400">total</span></> : <>{fmtEUR(c.precioCatalogo)}{c.tipo === 'mes' ? '/mes' : ''}</>}</td>
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
                      <div><label className="label" htmlFor="l-apellidos">Apellidos</label><input id="l-apellidos" required className="input" value={lead.apellidos} onChange={e => setLead({ ...lead, apellidos: e.target.value })} /></div>
                      <div><label className="label" htmlFor="l-empresa">Empresa</label><input id="l-empresa" required className="input" value={lead.empresa} onChange={e => setLead({ ...lead, empresa: e.target.value })} /></div>
                      <div><label className="label" htmlFor="l-cif">CIF</label><input id="l-cif" className="input" placeholder="B-00000000" value={lead.cif} onChange={e => setLead({ ...lead, cif: e.target.value })} /></div>
                      <div><label className="label" htmlFor="l-cargo">Cargo</label><input id="l-cargo" className="input" placeholder="p. ej. Director de Calidad" value={lead.cargo} onChange={e => setLead({ ...lead, cargo: e.target.value })} /></div>
                      <div><label className="label" htmlFor="l-email">Email</label><input id="l-email" type="email" required className="input" value={lead.email} onChange={e => setLead({ ...lead, email: e.target.value })} /></div>
                      <div className="sm:col-span-2"><label className="label" htmlFor="l-tel">Teléfono</label><input id="l-tel" className="input" value={lead.telefono} onChange={e => setLead({ ...lead, telefono: e.target.value })} /></div>
                    </div>
                    <label className="mt-4 flex items-start gap-2 text-xs font-medium text-navy-400">
                      <input type="checkbox" checked={lead.consent} onChange={e => setLead({ ...lead, consent: e.target.checked })} className="mt-0.5" />
                      <span>Acepto que los responsables de TuConsultor traten mis datos para contactarme sobre esta propuesta. He leído la <a href="/legal/privacidad.html" target="_blank" rel="noreferrer" className="font-semibold text-brand-orangeDark underline">política de privacidad</a> (RGPD). Puedo retirar el consentimiento en cualquier momento.</span>
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
          <div className="rounded-[22px] bg-navy-900 p-6 text-white shadow-xl">
            <p className="eyebrow !text-brand-orange">Tu precio en vivo</p>
            {res ? (
              <>
                {res.fraccionado ? (
                  <>
                    <p className="mt-3 text-4xl font-extrabold tracking-tight">{fmtEUR(res.fraccionado.totalSinIva)}<span className="text-base font-bold text-white/60"> sin IVA</span></p>
                    <p className="mt-1 text-sm font-semibold text-white/70">{fmtEUR(res.fraccionado.totalConIva)} con IVA · {res.fraccionado.meses} meses de implantación</p>
                    <div className="mt-3 space-y-1.5 rounded-2xl bg-white/10 p-3 text-sm font-semibold text-white/90">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-orange/90">Pagos (IVA incluido)</p>
                      <p>50% ahora: <strong>{fmtEUR(res.fraccionado.cuota1)}</strong></p>
                      <p>50% antes de auditoría: <strong>{fmtEUR(res.fraccionado.cuota2)}</strong></p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-4xl font-extrabold tracking-tight">{fmtEUR(res.precioCatalogo)}<span className="text-base font-bold text-white/60">{res.tipo === 'mes' ? ' /mes sin IVA' : ' sin IVA'}</span></p>
                    <p className="mt-1 text-sm font-semibold text-white/70">{fmtEUR(res.totalConIva)} con IVA{res.tipo === 'mes' ? '/mes' : ''}</p>
                    <div className="mt-3 space-y-1 rounded-2xl bg-white/10 p-3 text-sm font-semibold text-white/90">
                      <p className="flex justify-between"><span className="text-white/70">Base sin IVA</span><strong>{fmtEUR(res.precioCatalogo)}</strong></p>
                      <p className="flex justify-between"><span className="text-white/70">IVA 21 %</span><strong>{fmtEUR(res.iva)}</strong></p>
                      <p className="flex justify-between border-t border-white/15 pt-1"><span className="text-white/70">{res.tipo === 'mes' ? 'Pago mensual' : 'Pago único'} (IVA incl.)</span><strong>{fmtEUR(res.totalConIva)}</strong></p>
                    </div>
                  </>
                )}
                <div className="mt-4 space-y-1.5 text-sm font-medium text-white/80">
                  <p>{res.nSistemas} sistema{res.nSistemas > 1 ? 's' : ''} · modelo {modelo}</p>
                  {modelo !== 'Implantación' && <p>{res.hTotal} h de consultor{res.tipo === 'mes' ? ' cada mes' : ''}</p>}
                </div>
              </>
            ) : (
              <p className="mt-3 font-semibold text-white/60">Selecciona al menos una norma para ver el precio.</p>
            )}
            <div className="mt-5 border-t border-white/15 pt-4 text-xs font-medium leading-relaxed text-white/50">
              Precio de catálogo. Suelo de 350 €/mes en modelos recurrentes. Apoyo no contratable a &lt;60 días de auditoría externa.
              <span className="mt-2 block font-semibold text-white/65">Canarias: IGIC no aplica (0% / exento). El IVA del 21 % se sustituye por la base sin impuesto.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
