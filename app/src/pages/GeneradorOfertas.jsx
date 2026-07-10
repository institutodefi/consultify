import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { NORMAS, MODELOS, MODELO_IDS, calcular, fmtEUR } from '../lib/calcEngine.js';
import { insertRow, siguienteNumeroOferta, upsertClienteDesdeFormulario } from '../lib/data.js';
import { linkWhatsApp } from '../lib/telefono.js';
import { useAuth } from '../lib/auth.jsx';

// Generador de ofertas: selección de normas + modelo + datos del cliente,
// precio en vivo (sin/con IVA) y exportación a PDF/PPTX vía la función serverless.
export default function GeneradorOfertas({ publico = false }) {
  const { user } = useAuth();
  const [sel, setSel] = useState(['9001']);          // 9001 base obligatoria
  const [modelo, setModelo] = useState('Implicación');
  const [meses, setMeses] = useState('');            // vacío = usa el mínimo del modelo
  const [tiene9001, setTiene9001] = useState(false); // "ya tengo la 9001" → −50% horas 9001
  const [cli, setCli] = useState({ nombre: '', apellidos: '', empresa: '', cif: '', cargo: '', email: '', telefono: '', direccion: '' });
  const location = useLocation();
  // Si llegamos desde la ficha de un cliente ("Lanzar oferta"), prerrellenar sus datos.
  useEffect(() => {
    const c = location.state?.clientePrefill;
    if (c) {
      setCli(prev => ({
        ...prev,
        nombre: c.contacto || prev.nombre,
        apellidos: c.contacto_apellidos || prev.apellidos,
        empresa: c.empresa || prev.empresa,
        cif: c.cif_matriz || c.cif || prev.cif,
        email: c.email || prev.email,
        telefono: c.telefono || prev.telefono,
      }));
    }
  }, [location.state]);
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
    if (!res) return;
    // Todos los datos del cliente son obligatorios.
    const faltan = [];
    if (!cli.empresa.trim()) faltan.push('Empresa');
    if (!cli.nombre.trim()) faltan.push('Nombre');
    if (!cli.apellidos.trim()) faltan.push('Apellidos');
    if (!cli.email.trim()) faltan.push('Email');
    if (!cli.telefono.trim()) faltan.push('Teléfono');
    if (!cli.cif.trim()) faltan.push('CIF');
    if (!cli.cargo.trim()) faltan.push('Cargo');
    if (faltan.length) { setError(`Faltan datos obligatorios: ${faltan.join(', ')}.`); return; }
    if (!/^\S+@\S+\.\S+$/.test(cli.email)) { setError('El email no tiene un formato válido.'); return; }
    if (!consent) { setError('Debes aceptar la política de privacidad para continuar.'); return; }
    if (!res.plazoOk) {
      setError(`El modelo ${modelo} requiere un mínimo de ${res.minMeses} meses. Ajusta la duración.`);
      return;
    }
    setError(null); setEstado('gen');

    const comercial = 'Alejandro';
    const contactoCompleto = `${cli.nombre} ${cli.apellidos}`.trim();
    const precioLead = res.fraccionado ? res.fraccionado.totalSinIva : res.precioCatalogo;
    const tipoLead = res.fraccionado ? 'fraccionado' : res.tipo;
    const nombresNormas = sel.map((id) => NORMAS.find((n) => n.id === id)?.nombre || id).join(' + ');
    const sufijo = tipoLead === 'mes' ? ' €/mes' : (tipoLead === 'fraccionado' ? ' € (proyecto)' : ' € (único)');
    const requerimiento = `${nombresNormas} · Modelo ${modelo} · ${precioLead}${sufijo}`;

    // 1) Número de oferta. Si la RPC falla, generamos uno de respaldo en cliente (no bloquea).
    let numero;
    try {
      numero = await siguienteNumeroOferta();
    } catch {
      numero = `OFE-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
    }

    // 2) Guardar el presupuesto. Es el alta en la base de datos: si falla, lo informamos.
    let fila = null;
    let errorInsert = null;
    try {
      fila = await insertRow('presupuestos', {
        empresa: cli.empresa, nombre: contactoCompleto, email: cli.email, telefono: cli.telefono,
        cif: cli.cif, cargo: cli.cargo, normas: sel, modelo, precio: precioLead, tipo: tipoLead,
        numero_oferta: numero, comercial, requerimiento,
        ...(user?.id && user.id !== 'demo' ? { user_id: user.id } : {}),
      });
    } catch (e) {
      errorInsert = e?.message || e?.error_description || String(e);
      console.error('insertRow presupuestos', e);
    }

    // 3) Enviar el lead a Brevo (no bloquea).
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

    // 3-bis) Con consentimiento RGPD, el solicitante queda como cliente
    // (código CL-NNNN autogenerado, Fátima como Director de Proyecto por defecto).
    // Si ya existe (mismo email o CIF), se actualiza en vez de duplicar.
    if (cli.email && consent) {
      try {
        await upsertClienteDesdeFormulario({
          empresa: cli.empresa, contacto: contactoCompleto,
          email: cli.email, telefono: cli.telefono, cif: cli.cif,
        });
      } catch (e) { console.error('upsert cliente', e); }
    }

    // 4) Generar el documento (PDF + PPTX). Aquí sí informamos del error real si lo hay.
    try {
      const r = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas: sel, modelo, empresa: cli.empresa, contacto: contactoCompleto,
          cif: cli.cif, cargo: cli.cargo, ref: numero, comercial,
          meses: res.meses, tiene9001, direccion: cli.direccion,
          email: cli.email, presupuesto_id: fila?.id,
        }),
      });
      // La función podría devolver HTML (404/500) en vez de JSON: lo controlamos.
      let j = null;
      try { j = await r.json(); } catch { j = null; }
      const okDoc = !!(j && j.ok);
      if (okDoc || fila) {
        // Hubo éxito (documento y/o alta en BD). Avisamos si algo quedó a medias.
        setEstado({ ok: true, numero, parcial: !okDoc, ...(okDoc ? j : {}) });
        if (errorInsert) {
          setError(`Aviso: la oferta ${numero} no se guardó en la base de datos (${errorInsert}). Revisa permisos/RLS de la tabla "presupuestos".`);
        } else if (!okDoc && j?.error) {
          setError(`Oferta ${numero} registrada, pero el documento falló: ${j.error}`);
        }
      } else {
        setEstado(null);
        const motivo = errorInsert ? `alta en BD: ${errorInsert}` : (j?.error || `código ${r.status}`);
        setError(`No se pudo generar la oferta (${motivo}).`);
      }
    } catch (e) {
      if (fila) {
        setEstado({ ok: true, numero, parcial: true });
      } else {
        setEstado(null);
        setError('No se pudo registrar la oferta. Revisa la conexión e inténtalo de nuevo.');
      }
    }
  }

  // Solicitud de información para normas no listadas ("Otra norma · pide info").
  async function enviarSolicitudInfo() {
    if (!cli.email || !consent) { setError('Indica email y acepta la política para enviar la solicitud.'); return; }
    setError(null); setInfoState('sending');
    const contactoCompleto = `${cli.nombre} ${cli.apellidos}`.trim();
    const requerimiento = `SOLICITUD DE INFORMACIÓN · Otra norma · ${cli.normaInteres || 'sin especificar'}`;
    // 1) Alta en base de datos (queda como lead en el CRM con tipo 'consulta')
    try {
      let numero;
      try { numero = await siguienteNumeroOferta(); } catch { numero = `OFE-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`; }
      await insertRow('presupuestos', {
        empresa: cli.empresa, nombre: contactoCompleto, email: cli.email, telefono: cli.telefono,
        cif: cli.cif, cargo: cli.cargo, requerimiento, comercial: 'Alejandro',
        numero_oferta: numero, tipo: 'consulta',
        ...(user?.id && user.id !== 'demo' ? { user_id: user.id } : {}),
      });
    } catch (e) { console.error('insertRow consulta', e); }
    // 2) Enviar a Brevo (no bloquea)
    try {
      await fetch('/.netlify/functions/brevo-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: contactoCompleto, empresa: cli.empresa, email: cli.email, telefono: cli.telefono,
          cif: cli.cif, cargo: cli.cargo, comercial: 'Alejandro',
          requerimiento, consent: true,
        }),
      });
      setInfoState('ok');
    } catch (e) { setInfoState('error'); }
  }

  return (
    <div className={publico ? 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10' : ''}>
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

                {/* Datos del cliente, dentro del panel para no perder al usuario */}
                <div className="mt-4 border-t border-white/15 pt-4">
                  <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-brand-orange">Tus datos {publico ? 'para recibir la propuesta' : 'para la oferta'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input required autoComplete="organization" className="col-span-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand-orange focus:outline-none" placeholder="Empresa / Cliente *" value={cli.empresa} onChange={e => setCli({ ...cli, empresa: e.target.value })} />
                    <input required autoComplete="given-name" className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand-orange focus:outline-none" placeholder="Nombre *" value={cli.nombre} onChange={e => setCli({ ...cli, nombre: e.target.value })} />
                    <input required autoComplete="family-name" className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand-orange focus:outline-none" placeholder="Apellidos *" value={cli.apellidos} onChange={e => setCli({ ...cli, apellidos: e.target.value })} />
                    {/* Email destacado: fila completa, texto grande, para que se lea bien lo que se escribe */}
                    <div className="col-span-2">
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-brand-orange">Email * (te enviaremos aquí la propuesta)</label>
                      <input required autoComplete="email" type="email" inputMode="email" spellCheck={false} className="w-full rounded-lg border-2 border-white/25 bg-white/15 px-4 py-3 text-lg font-semibold text-white placeholder-white/40 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/40" placeholder="tucorreo@empresa.com" value={cli.email} onChange={e => setCli({ ...cli, email: e.target.value })} />
                    </div>
                    <input required autoComplete="tel" type="tel" className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand-orange focus:outline-none" placeholder="Teléfono *" value={cli.telefono} onChange={e => setCli({ ...cli, telefono: e.target.value })} />
                    <input required autoComplete="off" className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand-orange focus:outline-none" placeholder="CIF *" value={cli.cif} onChange={e => setCli({ ...cli, cif: e.target.value })} />
                    <input required autoComplete="organization-title" className="col-span-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand-orange focus:outline-none" placeholder="Cargo *" value={cli.cargo} onChange={e => setCli({ ...cli, cargo: e.target.value })} />
                    <input autoComplete="street-address" className="col-span-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand-orange focus:outline-none" placeholder="Dirección (opcional, sale en la oferta)" value={cli.direccion} onChange={e => setCli({ ...cli, direccion: e.target.value })} />
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-white/40">Todos los campos son obligatorios.</p>
                  <label className="mt-3 flex items-start gap-2 text-[11.5px] text-white/70 cursor-pointer">
                    <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-orange" />
                    <span>Acepto que TuConsultor trate mis datos para gestionar esta solicitud. <a href="/legal/privacidad.html" target="_blank" rel="noreferrer" className="font-semibold text-brand-orange underline">Política de privacidad</a> (RGPD).</span>
                  </label>
                </div>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => generar('pdf')} disabled={estado === 'gen' || plazoMal} className="flex-1 rounded-xl bg-white py-3 text-sm font-extrabold text-navy-900 transition hover:bg-white/90 disabled:opacity-50">
                    {estado === 'gen' ? 'Generando…' : plazoMal ? `Mínimo ${res.minMeses} meses` : (publico ? 'Recibir mi propuesta' : 'Generar oferta')}
                  </button>
                </div>
                {error && <p className="mt-3 rounded-lg bg-red-500/20 p-2 text-xs font-bold text-red-100">{error}</p>}
                {estado?.ok && (
                  <div className="mt-3 rounded-xl bg-brand-orange/15 p-3 text-sm">
                    <p className="font-extrabold text-brand-orange">{publico ? 'Solicitud registrada' : `Oferta ${estado.numero} generada`}</p>
                    {estado.parcial ? (
                      <p className="mt-1 text-xs font-medium text-white/80">
                        {publico
                          ? 'Hemos recibido tu solicitud. Un asesor te enviará la propuesta en PDF muy pronto.'
                          : `Oferta ${estado.numero} registrada. El documento se está generando; si no aparece, puedes regenerarlo desde Ofertas.`}
                      </p>
                    ) : (
                      <div className="mt-2 flex gap-3">
                        {estado.url_pdf && <a href={estado.url_pdf} target="_blank" rel="noreferrer" className="font-bold text-white underline">PDF</a>}
                        {estado.url_pptx && <a href={estado.url_pptx} target="_blank" rel="noreferrer" className="font-bold text-white underline">PowerPoint</a>}
                      </div>
                    )}
                    {!publico && cli.telefono.trim() && (
                      <a href={linkWhatsApp(cli.telefono, `Hola ${cli.nombre}, te enviamos la oferta ${estado.numero} de TuConsultor.`)}
                        target="_blank" rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-extrabold text-white transition hover:opacity-90">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.693.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                        Enviar por WhatsApp
                      </a>
                    )}
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
