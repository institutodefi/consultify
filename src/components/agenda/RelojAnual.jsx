import { TOPE_ANUAL } from '../../lib/jornada';

/**
 * RELOJ ANUAL — gauge de 270° sobre el tope de 1.800 h.
 *   · Arco naranja        = horas previstas (plan de todo el año)
 *   · Arco navy (interior) = horas reales imputadas
 *   · Aguja navy           = proyección a fin de año al ritmo real
 *   · Marca roja           = tope legal 1.800 h
 */
export default function RelojAnual({ previstas, reales, proyeccion, ritmo }) {
  const R = 92, RI = 74, CX = 120, CY = 120;
  const START = 135, SWEEP = 270;

  const angulo = (horas) => START + SWEEP * Math.min(horas / TOPE_ANUAL, 1.12) / 1.12;

  const polar = (deg, r) => {
    const rad = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
  };

  const arco = (desdeDeg, hastaDeg, r) => {
    const [x1, y1] = polar(desdeDeg, r);
    const [x2, y2] = polar(hastaDeg, r);
    const large = hastaDeg - desdeDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const aPrev = angulo(previstas);
  const aReal = angulo(reales);
  const aProy = angulo(proyeccion);
  const aTope = angulo(TOPE_ANUAL);
  const [nx, ny] = polar(aProy, RI - 12);
  const [tx1, ty1] = polar(aTope, R - 10);
  const [tx2, ty2] = polar(aTope, R + 10);

  const pctPrev = Math.round((previstas / TOPE_ANUAL) * 100);
  const pctReal = Math.round((reales / TOPE_ANUAL) * 100);
  const pctProy = Math.round((proyeccion / TOPE_ANUAL) * 100);
  const sobre = proyeccion > TOPE_ANUAL;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 240 200" className="w-full max-w-[280px]">
        {/* pistas */}
        <path d={arco(START, START + SWEEP, R)} fill="none" stroke="#E2E8F0" strokeWidth="12" strokeLinecap="round" />
        <path d={arco(START, START + SWEEP, RI)} fill="none" stroke="#F1F5F9" strokeWidth="9" strokeLinecap="round" />
        {/* previsto (naranja, exterior) */}
        {previstas > 0 && (
          <path d={arco(START, aPrev, R)} fill="none" stroke="#F5A623" strokeWidth="12" strokeLinecap="round" />
        )}
        {/* real (navy, interior) */}
        {reales > 0 && (
          <path d={arco(START, aReal, RI)} fill="none" stroke="#061B45" strokeWidth="9" strokeLinecap="round" />
        )}
        {/* tope 1.800h */}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#DC2626" strokeWidth="3" />
        {/* aguja de proyección */}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 2" />
        <circle cx={CX} cy={CY} r="5" fill="#475569" />
        {/* centro */}
        <text x={CX} y={CY + 32} textAnchor="middle" className="fill-slate-900" fontSize="20" fontWeight="800">
          {Math.round(reales).toLocaleString('es-ES')} h
        </text>
        <text x={CX} y={CY + 47} textAnchor="middle" className="fill-slate-500" fontSize="9.5">
          reales · {pctReal}% de {TOPE_ANUAL.toLocaleString('es-ES')} h
        </text>
      </svg>

      <div className="grid w-full grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-lg bg-amber-50 px-2 py-1.5">
          <p className="font-bold text-amber-700">{Math.round(previstas).toLocaleString('es-ES')} h</p>
          <p className="text-amber-600/80">previstas · {pctPrev}%</p>
        </div>
        <div className={`rounded-lg px-2 py-1.5 ${sobre ? 'bg-red-50' : 'bg-slate-50'}`}>
          <p className={`font-bold ${sobre ? 'text-red-700' : 'text-slate-700'}`}>
            {Math.round(proyeccion).toLocaleString('es-ES')} h
          </p>
          <p className={sobre ? 'text-red-600/80' : 'text-slate-500'}>proyección · {pctProy}%</p>
        </div>
      </div>
      {sobre && (
        <p className="mt-1.5 text-xs font-semibold text-red-600">La proyección supera el tope del convenio</p>
      )}
      <p className="mt-1 text-xs text-slate-400">
        Ritmo real: {ritmo.toFixed(1)} h imputadas por día laborable transcurrido
      </p>
    </div>
  );
}
