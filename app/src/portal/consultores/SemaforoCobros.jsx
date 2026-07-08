// Piloto de estado de cobros (facturas Holded), reutilizable junto al nombre del cliente.
// estado: 'verde' | 'amarillo' | 'rojo' | null
const CONF = {
  verde:    { color: '#16a34a', txt: 'Al día' },
  amarillo: { color: '#f5a623', txt: 'Pagos pendientes' },
  rojo:     { color: '#dc2626', txt: 'Facturas vencidas' },
};

export default function SemaforoCobros({ estado, detalle, actualizado, size = 10 }) {
  if (!estado || !CONF[estado]) {
    return <span title="Sin datos de cobros" className="inline-block rounded-full bg-navy-200" style={{ width: size, height: size }} />;
  }
  const c = CONF[estado];
  let tip = c.txt;
  if (detalle) {
    const partes = [];
    if (detalle.vencidas) partes.push(`${detalle.vencidas} vencida(s)`);
    if (detalle.pendientes) partes.push(`${detalle.pendientes} pendiente(s)`);
    if (detalle.importe_vencido) partes.push(`${detalle.importe_vencido} € vencido`);
    if (partes.length) tip += ' · ' + partes.join(' · ');
  }
  if (actualizado) tip += ` (act. ${new Date(actualizado).toLocaleDateString('es-ES')})`;
  return (
    <span title={tip} className="inline-block rounded-full" style={{ width: size, height: size, background: c.color, boxShadow: `0 0 0 2px ${c.color}22` }} />
  );
}
