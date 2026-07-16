/* =============================================================================
   Botón flotante de WhatsApp con captura de contacto.
   Al pulsar, ofrece:
     · "Chatear ya"      → abre WhatsApp directo (sin fricción)
     · "Dejar mis datos" → mini-formulario (nombre, apellidos, cargo, email*)
                           → registra en Brevo (doble opt-in) y abre WhatsApp
   Cambia NUMERO o MENSAJE si hace falta.
   ============================================================================= */
(function () {
  var NUMERO = '34615478641'; // sin + ni espacios
  var MENSAJE = 'Hola, os escribo desde la web de Consultify. Me gustaría más información.';
  var WA = 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(MENSAJE);

  if (document.getElementById('wa-flotante')) return;

  // ---------- Estilos ----------
  var css = document.createElement('style');
  css.textContent = [
    '#wa-flotante{position:fixed;right:20px;bottom:20px;z-index:9998;width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.22);cursor:pointer;transition:transform .15s ease}',
    '#wa-flotante:hover{transform:scale(1.07)}',
    '#wa-flotante::after{content:"";position:absolute;inset:0;border-radius:50%;animation:wa-pulse 2.4s infinite}',
    '@keyframes wa-pulse{0%{box-shadow:0 0 0 0 rgba(37,211,102,.5)}70%{box-shadow:0 0 0 14px rgba(37,211,102,0)}100%{box-shadow:0 0 0 0 rgba(37,211,102,0)}}',
    '#wa-panel{position:fixed;right:20px;bottom:88px;z-index:9999;width:320px;max-width:calc(100vw - 40px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(6,27,69,.28);overflow:hidden;font-family:Arial,Helvetica,sans-serif;display:none}',
    '#wa-panel.open{display:block}',
    '#wa-panel .head{background:#075E54;color:#fff;padding:14px 16px}',
    '#wa-panel .head b{font-size:15px}',
    '#wa-panel .head p{margin:2px 0 0;font-size:12px;color:#c8e6df;opacity:.85}',
    '#wa-panel .body{padding:16px}',
    '#wa-panel .opt{display:block;width:100%;box-sizing:border-box;text-align:center;border:0;border-radius:12px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:8px}',
    '#wa-panel .opt.primary{background:#25D366;color:#062e24}',
    '#wa-panel .opt.ghost{background:#fff;border:1.5px solid #d7deea;color:#061B45}',
    '#wa-panel form{display:none}',
    '#wa-panel form.open{display:block}',
    '#wa-panel input{width:100%;box-sizing:border-box;border:1px solid #d7deea;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:8px}',
    '#wa-panel input:focus{outline:none;border-color:#25D366}',
    '#wa-panel .row{display:flex;gap:8px}',
    '#wa-panel .consent{display:flex;gap:7px;align-items:flex-start;font-size:11.5px;color:#475569;margin:4px 0 10px;line-height:1.45}',
    '#wa-panel .consent input{width:auto;margin:2px 0 0}',
    '#wa-panel .send{background:#25D366;color:#062e24;border:0;border-radius:12px;padding:12px;width:100%;font-size:14px;font-weight:800;cursor:pointer}',
    '#wa-panel .send:disabled{opacity:.6}',
    '#wa-panel .estado{font-size:12.5px;font-weight:600;margin-top:8px}',
    '#wa-panel .estado.err{color:#dc2626}',
    '#wa-panel .estado.ok{color:#166534}',
    '#wa-panel .cerrar{position:absolute;top:10px;right:12px;color:#fff;background:transparent;border:0;font-size:20px;cursor:pointer;line-height:1}',
    '@media(max-width:560px){#wa-flotante{right:16px;bottom:16px;width:52px;height:52px}#wa-panel{right:16px;bottom:80px}}'
  ].join('');

  // ---------- Botón ----------
  var btn = document.createElement('div');
  btn.id = 'wa-flotante';
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-label', 'Contactar por WhatsApp');
  btn.innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.12.55 4.2 1.6 6.03L4 29l8.1-1.56a12 12 0 0 0 3.94.67h.01C22.7 28.1 28.1 22.7 28.1 16.06 28.1 8.4 22.7 3 16.04 3zm0 21.9h-.01a10 10 0 0 1-5.07-1.39l-.36-.21-3.78.73.75-3.69-.24-.38A9.86 9.86 0 0 1 6.1 15.04C6.1 9.55 10.55 5.1 16.04 5.1c2.65 0 5.14 1.04 7.02 2.92a9.86 9.86 0 0 1 2.9 7.03c0 5.49-4.44 9.94-9.92 9.94zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z"/></svg>';

  // ---------- Panel ----------
  var panel = document.createElement('div');
  panel.id = 'wa-panel';
  panel.innerHTML = [
    '<div class="head"><button class="cerrar" id="wa-x" aria-label="Cerrar">&times;</button>',
    '<b>¿Hablamos por WhatsApp?</b><p>Te respondemos lo antes posible.</p></div>',
    '<div class="body">',
    '<div id="wa-opciones">',
    '<button class="opt primary" id="wa-ya">Chatear ahora</button>',
    '<button class="opt ghost" id="wa-datos">Prefiero dejar mis datos</button>',
    '</div>',
    '<form id="wa-form">',
    '<div class="row"><input id="wa-nombre" type="text" placeholder="Nombre*" autocomplete="given-name"><input id="wa-ape" type="text" placeholder="Apellidos*" autocomplete="family-name"></div>',
    '<input id="wa-cargo" type="text" placeholder="Cargo*" autocomplete="organization-title">',
    '<input id="wa-email" type="email" placeholder="Email*" autocomplete="email">',
    '<label class="consent"><input type="checkbox" id="wa-consent"> Acepto la <a href="/legal/privacidad.html" target="_blank" style="color:#075E54">Política de Privacidad</a> y recibir comunicaciones comerciales.</label>',
    '<button class="send" id="wa-enviar" type="button">Enviar y abrir WhatsApp</button>',
    '<div class="estado" id="wa-estado"></div>',
    '</form>',
    '</div>'
  ].join('');

  function montar() {
    document.head.appendChild(css);
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    btn.addEventListener('click', function () { panel.classList.toggle('open'); });
    document.getElementById('wa-x').addEventListener('click', function () { panel.classList.remove('open'); });

    // Chatear ya → directo
    document.getElementById('wa-ya').addEventListener('click', function () {
      window.open(WA, '_blank', 'noopener');
      panel.classList.remove('open');
    });

    // Mostrar formulario
    document.getElementById('wa-datos').addEventListener('click', function () {
      document.getElementById('wa-opciones').style.display = 'none';
      document.getElementById('wa-form').classList.add('open');
    });

    // Enviar formulario → Brevo → abrir WhatsApp
    document.getElementById('wa-enviar').addEventListener('click', async function () {
      var estado = document.getElementById('wa-estado');
      var nombre = val('wa-nombre'), ape = val('wa-ape'), cargo = val('wa-cargo'), email = val('wa-email');
      var consent = document.getElementById('wa-consent').checked;
      if (!nombre || !ape || !cargo || !email) { estado.className = 'estado err'; estado.textContent = 'Nombre, apellidos, cargo y email son obligatorios.'; return; }
      var btnE = document.getElementById('wa-enviar');
      btnE.disabled = true; estado.className = 'estado'; estado.textContent = 'Enviando…';
      try {
        await fetch('/.netlify/functions/brevo-lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email, nombre: nombre, apellidos: ape, cargo: cargo,
            origen: 'whatsapp', consent: !!consent
          })
        });
      } catch (e) { /* aunque falle Brevo, abrimos WhatsApp igualmente */ }
      estado.className = 'estado ok'; estado.textContent = '¡Gracias! Abriendo WhatsApp…';
      // Mensaje personalizado con su nombre
      var msg = 'Hola, soy ' + nombre + ' ' + ape + (cargo ? ' (' + cargo + ')' : '') + '. Os escribo desde la web de Consultify.';
      window.open('https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      setTimeout(function () { panel.classList.remove('open'); resetForm(); btnE.disabled = false; }, 1200);
    });
  }

  function val(id) { return (document.getElementById(id).value || '').trim(); }
  function resetForm() {
    ['wa-nombre', 'wa-ape', 'wa-cargo', 'wa-email'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('wa-consent').checked = false;
    document.getElementById('wa-estado').textContent = '';
    document.getElementById('wa-opciones').style.display = 'block';
    document.getElementById('wa-form').classList.remove('open');
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
