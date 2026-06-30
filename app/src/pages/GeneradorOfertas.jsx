import { useMemo, useState } from 'react';
import { NORMAS, MODELOS, MODELO_IDS, calcular, fmtEUR } from '../lib/calcEngine.js';
import { insertRow, siguienteNumeroOferta } from '../lib/data.js';
import { useAuth } from '../lib/auth.jsx';

// Generador de ofertas: selección de normas + modelo + datos del cliente,
// precio en vivo (sin/con IVA) y exportación a PDF/PPTX vía la función serverless.
export default function GeneradorOfertas({ publico = false }) {
  const { user } = useAuth();
  const [sel, setSel] = useState(['9001']);          // 9001 base obligatoria
  const [modelo, setModelo] = useState('Implicación');
  const [meses, setMeses] = useState('');            // vacío = usa el mínimo del modelo
  const [tiene9001, setTiene9001] = useState(false); // "ya tengo la 9001" → −50% horas 9001
  const [cli, setCli] = useState({ nombre: '', apellidos: '', empresa: '', cif: '', cargo: '', email: '', telefono: '' });
  const [consent, setConsent] = useState(false);
  const [estado, setEstado] = useState(null);        // null | 'gen' | {ok,url_pdf,url_pptx,numero}
  const [error, setError] = useState(null);
  const [pideInfo, setPideInfo] = useState(false);   // "Otra norma · pide info": abre formulario de solicitud
  const [infoState, setInfoState] = useState('idle');// idle | sending | ok | error

  const toggle = (id) => {
    if (id === '9001') return;
    setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const res = useMemo(() => calcular(sel, modelo, { meses, tiene9001 }), [sel, modelo, meses, tiene9001]);
  const esImpl = res?.modelo === 'Implantación';
  const esApoyo = res?.modelo === 'Apoyo';
  const esMes = res?.tipo === 'mes' && !esImpl;
  const plazoMal = res && !res.plazoOk;

  async function generar() {
    if (!res || !cli.empresa.trim()) { setError('Indica al menos la empresa.'); return; }
    if (!res.plazoOk) {
      setError(`El modelo ${modelo} requiere un mínimo de ${res.minMeses} meses. Ajusta la duración.`);
      return;
    }
    setError(null); setEstado('gen');
    try {
      const numero = await siguienteNumeroOferta();
      const comercial = 'Alejandro';
      const contactoCompleto = `${cli.nombre} ${cli.apellidos}`.trim();
      const precioLead = res.fraccionado ? res.fraccionado.totalSinIva : res.precioCatalogo;
      const tipoLead = res.fraccionado ? 'fraccionado' : res.tipo;
      // Resumen legible del requerimiento para el comercial (CRM)
      const nombresNormas = sel.map((id) => NORMAS.find((n) => n.id === id)?.nombre || id).join(' + ');
      const sufijo = tipoLead === 'mes' ? ' €/mes' : (tipoLead === 'fraccionado' ? ' € (proyecto)' : ' € (único)');
      const requerimiento = `${nombresNormas} · Modelo ${modelo} · ${precioLead}${sufijo}`;
      // 1) Guardar la oferta como presupuesto interno (histórico de Ofertas + CRM)
      const fila = await insertRow('presupuestos', {
        empresa: cli.empresa, nombre: contactoCompleto, email: cli.email, telefono: cli.telefono,
        cif: cli.cif, cargo: cli.cargo, normas: sel, modelo, precio: precioLead, tipo: tipoLead,
        numero_oferta: numero, comercial, requerimiento,
        ...(user?.id && user.id !== 'demo' ? { user_id: user.id } : {}),
      });
      // 2) Enviar el lead a Brevo (igual que la Calculadora). No bloquea la generación.
      if (cli.email && consent) {
        fetch('/.netlify/functions/brevo-lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: contactoCompleto, empresa: cli.empresa, email: cli.email, telefono: cli.telefono,
            cif: cli.cif, cargo: cli.cargo, numero_oferta: numero, comercial,
            normas: sel, modelo, precio: precioLead, tipo: tipoLead,
            meses: res.meses, tiene9001, consent: true,
          }),
        }).catch(() => {});
      }
      // 3) Generar el documento (PDF + PPTX) y guardar las URLs
      const r = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas: sel, modelo, empresa: cli.empresa, contacto: contactoCompleto,
          cif: cli.cif, cargo: cli.cargo, ref: numero, comercial,
          meses: res.meses, tiene9001,
          email: cli.email, presupuesto_id: fila?.id,
        }),
      });
      const j = await r.json();
      if (j.ok) setEstado({ ok: true, ...j, numero });
      else { setEstado(null); setError(j.error || 'No se pudo generar la oferta.'); }
    } catch (e) {
      setEstado(null); setError('No se pudo generar la oferta. Inténtalo de nuevo.');
    }
  }

  // Solicitud de información para normas no listadas ("Otra norma · pide info").
  async function enviarSolicitudInfo() {
    if (!cli.email || !consent) { setError('Indica email y acepta la política para enviar la solicitud.'); return; }
    setError(null); setInfoState('sending');
    try {
      const contactoCompleto = `${cli.nombre} ${cli.apellidos}`.trim();
      await fetch('/.netlify/functions/brevo-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: contactoCompleto, empresa: cli.empresa, email: cli.email, telefono: cli.telefono,
          cif: cli.cif, cargo: cli.cargo, comercial: 'Alejandro',
          requerimiento: `SOLICITUD DE INFORMACIÓN · Otra norma · ${cli.normaInteres || 'sin especificar'}`,
          consent: true,
        }),
      });
      setInfoState('ok');
    } catch (e) { setInfoState('error'); }
  }

  return (
    <div>
      <div className="mb-6 max-w-2xl">
        <p className="eyebrow">{publico ? 'Calcula tu oferta' : 'Generador de ofertas'}</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">{publico ? 'Tu sistema de gestión, con precio en 60 segundos' : 'Crea una oferta en 60 segundos'}</h1>
        <p className="mt-2 text-sm font-medium text-navy-400">Elige normas y modelo, mira el precio en vivo y {publico ? 'recibe tu propuesta personalizada.' : 'exporta la oferta en PDF y PowerPoint.'}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <div className="space-y-5">
          {/* 1 · Normas */}
          <section className="card">
            <h2 className="mb-4 text-xs font-extrabold uppercase tracking-wider text-brand-orangeDark">1 · Normas a implantar</h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {NORMAS.map(n => {
                const on = sel.includes(n.id);
                const base = n.id === '9001';
                return (
                  <button key={n.id} onClick={() => toggle(n.id)} aria-disabled={base}
                    className={`flex items-start gap-3 rounded-xl border-[1.5px] p-3 text-left transition ${
                      base ? 'border-brand-orange bg-brand-orange/5'
                      : on ? 'border-navy-800 bg-navy-50' : 'border-navy-100 bg-white hover:border-navy-300'}`}>
                    <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] text-[11px] text-white ${
                      base ? 'border-brand-orange bg-brand-orange' : on ? 'border-navy-800 bg-navy-800' : 'border-navy-200 bg-white'}`}>
                      {(on || base) ? '✓' : ''}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight">{n.nombre}{base && <span className="ml-1.5 rounded bg-brand-orange px-1.5 py-px text-[9px] font-extrabold uppercase text-white align-middle">base</span>}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-navy-400">{n.desc}</span>
                    </span>
                  </button>
                );
              })}
              {/* Otra norma · pide info → abre el formulario de solicitud */}
              <button onClick={() => setPideInfo(v => !v)}
                className={`flex items-start gap-3 rounded-xl border-[1.5px] border-dashed p-3 text-left transition ${pideInfo ? 'border-brand-orange bg-brand-orange/5' : 'border-navy-200 bg-white hover:border-brand-orange'}`}>
                <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-brand-orange text-[13px] font-bold text-brand-orangeDark">?</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight text-brand-orangeDark">¿Quieres otra norma?</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-navy-400">No dudes en pedirnos información. Te asesoramos sin compromiso.</span>
                </span>
              </button>
            </div>

            {/* Formulario de solicitud de información */}
            {pideInfo && (
              <div className="mt-4 rounded-xl border-[1.5px] border-brand-orange/40 bg-brand-orange/5 p-4">
                {infoState === 'ok' ? (
                  <p className="text-sm font-bold text-brand-orangeDark">¡Gracias! Hemos recibido tu solicitud. Te contactaremos muy pronto.</p>
                ) : (
                  <>
                    <p className="mb-3 text-sm font-bold text-navy-800">Cuéntanos qué norma te interesa y te asesoramos.</p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <input className="input sm:col-span-2" placeholder="¿Qué norma o certificación te interesa?" value={cli.normaInteres || ''} onChange={e => setCli({ ...cli, normaInteres: e.target.value })} />
                      <input className="input" placeholder="Nombre" value={cli.nombre} onChange={e => setCli({ ...cli, nombre: e.target.value })} />
                      <input className="input" placeholder="Empresa" value={cli.empresa} onChange={e => setCli({ ...cli, empresa: e.target.value })} />
                      <input className="input" type="email" placeholder="Email" value={cli.email} onChange={e => setCli({ ...cli, email: e.target.value })} />
                      <input className="input" placeholder="Teléfono" value={cli.telefono} onChange={e => setCli({ ...cli, telefono: e.target.value })} />
                    </div>
                    <label className="mt-3 flex items-start gap-2.5 text-[12.5px] text-navy-500 cursor-pointer">
                      <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-orange" />
                      <span>Acepto que TuConsultor trate mis datos para contactarme. <a href="/legal/privacidad.html" target="_blank" rel="noreferrer" className="font-semibold text-brand-orangeDark underline">Política de privacidad</a> (RGPD).</span>
                    </label>
                    <button onClick={enviarSolicitudInfo} disabled={infoState === 'sending'}
                      className="mt-3 rounded-xl bg-brand-orange px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-orangeDark disabled:opacity-50">
                      {infoState === 'sending' ? 'Enviando…' : 'Solicitar información'}
                    </button>
                    {infoState === 'error' && <p className="mt-2 text-xs font-bold text-red-600">No se pudo enviar. Inténtalo de nuevo.</p>}
                  </>
                )}
              </div>
            )}
            <label className="mt-3 flex items-start gap-2.5 rounded-xl border-[1.5px] border-navy-100 bg-navy-50/50 p-3 cursor-pointer">
              <input type="checkbox" checked={tiene9001} onChange={e => setTiene9001(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-orange" />
              <span className="text-sm">
                <span className="font-bold">Ya tengo la ISO 9001 certificada</span>
                <span className="block text-[12px] text-navy-400">Aplica un 50 % de descuento sobre las horas de la ISO 9001 (sistema base ya implantado).</span>
              </span>
            </label>
          </section>

          {/* 2 · Modelo */}
          <section className="card">
            <h2 className="mb-4 text-xs font-extrabold uppercase tracking-wider text-brand-orangeDark">2 · Modelo de servicio</h2>
            <div className="flex flex-wrap gap-2">
              {MODELO_IDS.map(mid => {
                const on = modelo === mid;
                return (
                  <button key={mid} onClick={() => setModelo(mid)}
                    className={`min-w-[96px] flex-1 rounded-xl border-[1.5px] p-3 text-center transition ${
                      on ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-100 bg-white hover:border-navy-300'}`}>
                    <span className="block text-sm font-extrabold">{mid}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 max-w-[220px]">
              <label className="label">Duración del proyecto (meses)</label>
              <input type="number" min="1" className={`input ${plazoMal ? '!border-red-400' : ''}`}
                placeholder={res ? `mín. ${res.minMeses}` : ''} value={meses}
                onChange={e => setMeses(e.target.value)} />
              {res && (
                <p className={`mt-1 text-xs font-medium ${plazoMal ? 'text-red-600' : 'text-navy-400'}`}>
                  {plazoMal
                    ? `El modelo ${modelo} exige un mínimo de ${res.minMeses} meses.`
                    : `Mínimo para ${modelo}: ${res.minMeses} meses. En uso: ${res.meses}.`}
                </p>
              )}
            </div>
          </section>

          {/* 3 · Datos del cliente */}
          <section className="card">
            <h2 className="mb-4 text-xs font-extrabold uppercase tracking-wider text-brand-orangeDark">3 · Datos del cliente (para la oferta)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Empresa / Cliente</label><input className="input" placeholder="Residencia Los Olivos S.L." value={cli.empresa} onChange={e => setCli({ ...cli, empresa: e.target.value })} /></div>
              <div><label className="label">Nombre</label><input className="input" placeholder="Ana" value={cli.nombre} onChange={e => setCli({ ...cli, nombre: e.target.value })} /></div>
              <div><label className="label">Apellidos</label><input className="input" placeholder="García López" value={cli.apellidos} onChange={e => setCli({ ...cli, apellidos: e.target.value })} /></div>
              <div><label className="label">CIF</label><input className="input" placeholder="B-00000000" value={cli.cif} onChange={e => setCli({ ...cli, cif: e.target.value })} /></div>
              <div><label className="label">Cargo</label><input className="input" placeholder="Director de Calidad" value={cli.cargo} onChange={e => setCli({ ...cli, cargo: e.target.value })} /></div>
              <div><label className="label">Email</label><input className="input" type="email" placeholder="ana@empresa.es" value={cli.email} onChange={e => setCli({ ...cli, email: e.target.value })} /></div>
              <div><label className="label">Teléfono</label><input className="input" placeholder="600 000 000" value={cli.telefono} onChange={e => setCli({ ...cli, telefono: e.target.value })} /></div>
            </div>
            <label className="mt-4 flex items-start gap-2.5 text-[13px] text-navy-500 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-orange" />
              <span>El cliente acepta que los responsables de TuConsultor traten sus datos para gestionar esta oferta y contactarle. Ha sido informado de la <a href="/legal/privacidad.html" target="_blank" rel="noreferrer" className="font-semibold text-brand-orangeDark underline">política de privacidad</a> (RGPD).</span>
            </label>
          </section>
        </div>

        {/* Panel precio */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="rounded-[22px] bg-navy-900 p-6 text-white shadow-xl">
            <p className="eyebrow !text-brand-orange">Precio en vivo</p>
            {!res ? (
              <p className="mt-3 font-semibold text-white/60">Selecciona al menos una norma.</p>
            ) : (
              <>
                {res.fraccionado ? (
                  <>
                    <p className="mt-3 text-4xl font-extrabold tracking-tight">{fmtEUR(res.fraccionado.totalSinIva)}<span className="text-base font-bold text-white/60"> sin IVA</span></p>
                    <p className="mt-1 text-sm font-semibold text-white/70">{fmtEUR(res.fraccionado.totalConIva)} con IVA · {res.fraccionado.meses} meses</p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-4xl font-extrabold tracking-tight">{fmtEUR(res.precioCatalogo)}<span className="text-base font-bold text-white/60">{esMes ? ' /mes sin IVA' : ' sin IVA'}</span></p>
                    <p className="mt-1 text-sm font-semibold text-white/70">{fmtEUR(res.totalConIva)} con IVA{esMes ? '/mes' : ''}</p>
                  </>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-white/10 p-3"><span className="text-white/60 text-xs">Sistemas</span><b className="block text-lg font-extrabold">{res.nSistemas}</b></div>
                  <div className="rounded-xl bg-white/10 p-3"><span className="text-white/60 text-xs">{esMes ? 'Horas/mes' : 'Horas totales'}</span><b className="block text-lg font-extrabold">{res.hTotal}</b></div>
                </div>

                {res.tiene9001 && (
                  <p className="mt-3 rounded-xl bg-brand-orange/20 p-2.5 text-xs font-bold text-brand-orange">ISO 9001 ya certificada: −50 % en sus horas aplicado.</p>
                )}

                {/* Plan de pagos según modelo */}
                <div className="mt-4 rounded-xl bg-white/10 p-3 text-xs leading-relaxed text-white/85">
                  <p className="font-extrabold text-white/90 mb-1">Forma de pago</p>
                  {esApoyo && <p>Pago único prepagado al 100 % (bolsa de horas). Acompañamiento a auditoría aparte (600 €/jornada).</p>}
                  {esImpl && res.fraccionado && (
                    <>
                      <p>{res.fraccionado.plan}, sobre el total con IVA ({res.fraccionado.meses} meses):</p>
                      <div className="mt-1.5 space-y-0.5">
                        <p>1) Por adelantado · <b>{fmtEUR(res.fraccionado.cuota1)}</b></p>
                        <p>2) A mitad de proyecto · <b>{fmtEUR(res.fraccionado.cuota2)}</b></p>
                        <p>3) Al finalizar · <b>{fmtEUR(res.fraccionado.cuota3)}</b></p>
                      </div>
                    </>
                  )}
                  {esMes && <p>Cuota mensual recurrente. Permanencia mínima 12 meses.</p>}
                </div>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => generar('pdf')} disabled={estado === 'gen' || plazoMal} className="flex-1 rounded-xl bg-white py-3 text-sm font-extrabold text-navy-900 transition hover:bg-white/90 disabled:opacity-50">
                    {estado === 'gen' ? 'Generando…' : plazoMal ? `Mínimo ${res.minMeses} meses` : 'Generar oferta'}
                  </button>
                </div>
                {error && <p className="mt-3 rounded-lg bg-red-500/20 p-2 text-xs font-bold text-red-100">{error}</p>}
                {estado?.ok && (
                  <div className="mt-3 rounded-xl bg-brand-orange/15 p-3 text-sm">
                    <p className="font-extrabold text-brand-orange">Oferta {estado.numero} generada</p>
                    <div className="mt-2 flex gap-3">
                      {estado.url_pdf && <a href={estado.url_pdf} target="_blank" rel="noreferrer" className="font-bold text-white underline">PDF</a>}
                      {estado.url_pptx && <a href={estado.url_pptx} target="_blank" rel="noreferrer" className="font-bold text-white underline">PowerPoint</a>}
                    </div>
                  </div>
                )}
              </>
            )}
            <p className="mt-5 border-t border-white/15 pt-4 text-[11px] font-medium leading-relaxed text-white/50">
              Canarias: IGIC no aplica (0% / exento). El IVA del 21 % se sustituye por la base sin impuesto.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
