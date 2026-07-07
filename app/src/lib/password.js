// Reglas de robustez de contraseña (login fuerte).
// Mínimo 8 caracteres, con al menos una mayúscula, una minúscula y un número.
export function validarPassword(pwd) {
  const errores = [];
  if (!pwd || pwd.length < 8) errores.push('al menos 8 caracteres');
  if (!/[A-ZÁÉÍÓÚÑ]/.test(pwd || '')) errores.push('una mayúscula');
  if (!/[a-záéíóúñ]/.test(pwd || '')) errores.push('una minúscula');
  if (!/[0-9]/.test(pwd || '')) errores.push('un número');
  return { ok: errores.length === 0, errores };
}

// Mensaje legible para mostrar bajo el campo.
export function mensajePassword(pwd) {
  const { ok, errores } = validarPassword(pwd);
  if (ok) return null;
  return 'La contraseña debe tener ' + errores.join(', ') + '.';
}
