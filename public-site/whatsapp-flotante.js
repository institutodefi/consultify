/* =============================================================================
   Botón flotante de WhatsApp · se inyecta en todas las páginas que incluyan
   este script. Cambia NUMERO o MENSAJE si hace falta.
   ============================================================================= */
(function () {
  var NUMERO = '34615478641'; // sin + ni espacios
  var MENSAJE = 'Hola, os escribo desde la web de Consultify. Me gustaría más información.';

  // No duplicar si ya existe
  if (document.getElementById('wa-flotante')) return;

  var href = 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(MENSAJE);

  var a = document.createElement('a');
  a.id = 'wa-flotante';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Escríbenos por WhatsApp');
  a.innerHTML =
    '<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true">' +
    '<path d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.12.55 4.2 1.6 6.03L4 29l8.1-1.56a12 12 0 0 0 3.94.67h.01C22.7 28.1 28.1 22.7 28.1 16.06 28.1 8.4 22.7 3 16.04 3zm0 21.9h-.01a10 10 0 0 1-5.07-1.39l-.36-.21-3.78.73.75-3.69-.24-.38A9.86 9.86 0 0 1 6.1 15.04C6.1 9.55 10.55 5.1 16.04 5.1c2.65 0 5.14 1.04 7.02 2.92a9.86 9.86 0 0 1 2.9 7.03c0 5.49-4.44 9.94-9.92 9.94zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z"/>' +
    '</svg>';

  var css = document.createElement('style');
  css.textContent =
    '#wa-flotante{position:fixed;right:20px;bottom:20px;z-index:9998;width:56px;height:56px;border-radius:50%;' +
    'background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.22);' +
    'transition:transform .15s ease, box-shadow .15s ease;}' +
    '#wa-flotante:hover{transform:scale(1.07);box-shadow:0 8px 22px rgba(0,0,0,.28);}' +
    '#wa-flotante::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 0 rgba(37,211,102,.5);animation:wa-pulse 2.4s infinite;}' +
    '@keyframes wa-pulse{0%{box-shadow:0 0 0 0 rgba(37,211,102,.5)}70%{box-shadow:0 0 0 14px rgba(37,211,102,0)}100%{box-shadow:0 0 0 0 rgba(37,211,102,0)}}' +
    '@media(max-width:560px){#wa-flotante{right:16px;bottom:16px;width:52px;height:52px}}';

  function montar() {
    document.head.appendChild(css);
    document.body.appendChild(a);
  }
  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
