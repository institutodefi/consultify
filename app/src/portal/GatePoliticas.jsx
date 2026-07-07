import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

// Gate que se muestra en el primer login: el usuario debe aceptar las políticas
// de seguridad y confidencialidad antes de poder usar el portal.
export default function GatePoliticas() {
  const { aceptarPoliticas } = useAuth();
  const [marcado, setMarcado] = useState(false);
  const [busy, setBusy] = useState(false);

  async function aceptar() {
    if (!marcado) return;
    setBusy(true);
    await aceptarPoliticas();
    // el estado politicasOk pasa a true → el portal se desbloquea solo
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-navy-900 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-orange">Antes de empezar</p>
          <h1 className="mt-1 text-xl font-extrabold text-white">Políticas de seguridad y confidencialidad</h1>
        </div>

        <div className="max-h-[52vh] space-y-4 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-navy-600">
          <p>Como miembro del equipo de Consultify, al acceder a la plataforma aceptas cumplir las siguientes obligaciones de seguridad y confidencialidad:</p>

          <div>
            <h2 className="font-extrabold text-navy-900">1. Confidencialidad</h2>
            <p>Toda la información de clientes, proyectos, ofertas, precios y datos personales a la que accedas es estrictamente confidencial. No la compartirás, copiarás ni divulgarás fuera de la organización, ni durante ni después de tu relación con la empresa.</p>
          </div>

          <div>
            <h2 className="font-extrabold text-navy-900">2. Protección de datos (RGPD/LOPDGDD)</h2>
            <p>Tratarás los datos personales de clientes y contactos conforme al Reglamento (UE) 2016/679 y la LOPDGDD, únicamente para las finalidades del proyecto y bajo las instrucciones de la organización, aplicando las medidas de seguridad establecidas.</p>
          </div>

          <div>
            <h2 className="font-extrabold text-navy-900">3. Seguridad de la información</h2>
            <p>Custodiarás tus credenciales de acceso, no las compartirás con terceros, usarás contraseñas robustas y notificarás de inmediato cualquier incidente de seguridad o acceso no autorizado que detectes.</p>
          </div>

          <div>
            <h2 className="font-extrabold text-navy-900">4. Uso adecuado</h2>
            <p>Utilizarás la plataforma y la información exclusivamente para el desempeño de tus funciones profesionales, sin extraer datos para fines personales ni ajenos a la organización.</p>
          </div>

          <p className="text-xs text-navy-400">La aceptación queda registrada con fecha y hora. Si tienes dudas sobre estas políticas, consulta con la dirección antes de continuar.</p>
        </div>

        <div className="border-t border-navy-100 px-6 py-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={marcado} onChange={e => setMarcado(e.target.checked)} className="mt-0.5 h-5 w-5 rounded border-navy-300 text-brand-orange" />
            <span className="text-sm font-semibold text-navy-700">He leído y acepto las políticas de seguridad y confidencialidad de Consultify.</span>
          </label>
          <button onClick={aceptar} disabled={!marcado || busy} className="btn-primary mt-4 w-full disabled:opacity-40">
            {busy ? 'Guardando…' : 'Aceptar y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
