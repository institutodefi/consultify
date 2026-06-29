import { useMemo, useState } from 'react';
import { NORMAS, MODELOS, MODELO_IDS, calcular, fmtEUR } from '../lib/calcEngine.js';
import { insertRow, siguienteNumeroOferta } from '../lib/data.js';
import { useAuth } from '../lib/auth.jsx';

// Generador de ofertas: selección de normas + modelo + datos del cliente,
// precio en vivo (sin/con IVA) y exportación a PDF/PPTX vía la función serverless.
export default function GeneradorOfertas() {
  const { user } = useAuth();
  const [sel, setSel] = useState(['9001']);          // 9001 base obligatoria
  const [modelo, setModelo] = useState('Implicación');
  const [cli, setCli] = useState({ empresa: '', cif: '', contacto: '', cargo: '' });
  const [estado, setEstado] = useState(null);        // null | 'gen' | {ok,url_pdf,url_pptx,numero}
  const [error, setError] = useState(null);

  const toggle = (id) => {
    if (id === '9001') return;
    setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const res = useMemo(() => calcular(sel, modelo), [sel, modelo]);
  const esImpl = res?.modelo === 'Implantación';
  const esMes = res?.tipo === 'mes' && !esImpl;

  async function generar(formato) {
    if (!res || !cli.empresa.trim()) { setError('Indica al menos la empresa.'); return; }
    setError(null); setEstado('gen');
    try {
      const numero = await siguienteNumeroOferta();
      // Guardar la oferta como presupuesto interno (queda en el histórico de Ofertas)
      const precioLead = res.fraccionado ? res.fraccionado.totalSinIva : res.precioCatalogo;
      const tipoLead = res.fraccionado ? 'fraccionado' : res.tipo;
      const fila = await insertRow('presupuestos', {
        empresa: cli.empresa, nombre: cli.contacto, cif: cli.cif, cargo: cli.cargo,
        normas: sel, modelo, precio: precioLead, tipo: tipoLead,
        numero_oferta: numero, comercial: 'Alejandro',
        ...(user?.id && user.id !== 'demo' ? { user_id: user.id } : {}),
      });
      const r = await fetch('/.netlify/functions/generar-oferta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normas: sel, modelo, empresa: cli.empresa, contacto: cli.contacto,
          cif: cli.cif, cargo: cli.cargo, ref: numero, comercial: 'Alejandro',
          presupuesto_id: fila?.id,
        }),
      });
      const j = await r.json();
      if (j.ok) setEstado({ ok: true, ...j, numero });
      else { setEstado(null); setError(j.error || 'No se pudo generar la oferta.'); }
    } catch (e) {
      setEstado(null); setError('No se pudo generar la oferta. Inténtalo de nuevo.');
    }
  }

  return (
    <div>
      <div className="mb-6 max-w-2xl">
        <p className="eyebrow">Generador de ofertas</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">Crea una oferta en 60 segundos</h1>
        <p className="mt-2 text-sm font-medium text-navy-400">Elige normas y modelo, mira el precio en vivo y exporta la oferta en PDF y PowerPoint.</p>
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
            </div>
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
          </section>

          {/* 3 · Datos del cliente */}
          <section className="card">
            <h2 className="mb-4 text-xs font-extrabold uppercase tracking-wider text-brand-orangeDark">3 · Datos del cliente (para la oferta)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Empresa / Cliente</label><input className="input" placeholder="Residencia Los Olivos S.L." value={cli.empresa} onChange={e => setCli({ ...cli, empresa: e.target.value })} /></div>
              <div><label className="label">CIF</label><input className="input" placeholder="B-00000000" value={cli.cif} onChange={e => setCli({ ...cli, cif: e.target.value })} /></div>
              <div><label className="label">Cargo</label><input className="input" placeholder="Director de Calidad" value={cli.cargo} onChange={e => setCli({ ...cli, cargo: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="label">Contacto</label><input className="input" placeholder="Nombre y apellidos" value={cli.contacto} onChange={e => setCli({ ...cli, contacto: e.target.value })} /></div>
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
                  <div className="rounded-xl bg-white/10 p-3"><span className="text-white/60 text-xs">Horas{esMes ? '/mes' : ''}</span><b className="block text-lg font-extrabold">{res.hTotal}</b></div>
                </div>
                <p className="mt-4 rounded-xl bg-white/10 p-3 text-xs font-medium leading-relaxed text-white/80">{res.leyenda}</p>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => generar('pdf')} disabled={estado === 'gen'} className="flex-1 rounded-xl bg-white py-3 text-sm font-extrabold text-navy-900 transition hover:bg-white/90 disabled:opacity-50">
                    {estado === 'gen' ? 'Generando…' : 'Generar oferta'}
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
