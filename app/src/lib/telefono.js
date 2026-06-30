// Utilidades para teléfono / WhatsApp.
// Normaliza un número español a formato internacional (sin +, sin espacios)
// para construir el enlace wa.me. Si ya trae prefijo internacional, lo respeta.
export function normalizarTelefono(tel) {
  if (!tel) return '';
  let t = String(tel).trim().replace(/[\s.()-]/g, '');
  if (t.startsWith('+')) return t.slice(1);
  if (t.startsWith('00')) return t.slice(2);
  // Número nacional español (9 dígitos) → anteponer 34
  if (/^[0-9]{9}$/.test(t)) return '34' + t;
  return t.replace(/[^0-9]/g, '');
}

// Enlace a WhatsApp con mensaje opcional pre-rellenado.
export function linkWhatsApp(tel, mensaje = '') {
  const num = normalizarTelefono(tel);
  if (!num) return '';
  const base = `https://wa.me/${num}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

// Enlace tel: para llamar.
export function linkTel(tel) {
  const num = normalizarTelefono(tel);
  return num ? `tel:+${num}` : '';
}
