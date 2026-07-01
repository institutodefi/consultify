/* Consultify · Banner de cookies (AEPD) · sin dependencias.
   Inserta un pop-up con Aceptar / Rechazar / Configurar y recuerda la elección.
   Para activar analítica real, lee el consentimiento con: window.consentimientoCookies(). */
(function () {
  var KEY = 'consultify_cookies_v1';
  function leer() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  // API pública para que el resto del sitio sepa si puede cargar analítica
  window.consentimientoCookies = function () { return leer() || { necesarias: true, analiticas: false }; };

  var css = `
  #cky-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:520px;margin:0 auto;
    background:#fff;border:1px solid #e3e9f2;border-radius:18px;box-shadow:0 18px 50px rgba(6,27,69,.22);
    font-family:'Manrope',system-ui,sans-serif;color:#0c1424;padding:20px 22px;animation:ckyup .3s ease}
  @keyframes ckyup{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
  #cky-banner h3{margin:0 0 6px;font-size:16px;color:#061B45;font-weight:800}
  #cky-banner p{margin:0 0 14px;font-size:13px;line-height:1.5;color:#5b6b86}
  #cky-banner a{color:#d8910e;font-weight:600;text-decoration:none}
  .cky-btns{display:flex;gap:8px;flex-wrap:wrap}
  .cky-btns button{flex:1;min-width:120px;border:0;border-radius:11px;padding:11px 12px;font:inherit;
    font-weight:700;font-size:13px;cursor:pointer;transition:.15s}
  .cky-acc{background:#F5A623;color:#fff}.cky-acc:hover{background:#d8910e}
  .cky-rej{background:#eef2f8;color:#061B45}.cky-rej:hover{background:#e0e7f3}
  .cky-cfg{background:#fff;color:#5b6b86;border:1.5px solid #e3e9f2!important;flex:0 0 auto;min-width:0;padding:11px 14px}
  .cky-panel{margin:6px 0 14px;border-top:1px solid #e3e9f2;padding-top:12px}
  .cky-row{display:flex;align-items:flex-start;gap:10px;margin:8px 0;font-size:13px}
  .cky-row input{margin-top:3px}
  .cky-row b{color:#061B45}
  .cky-row span{color:#5b6b86}
  #cky-fab{position:fixed;left:14px;bottom:14px;z-index:99998;background:#fff;border:1px solid #e3e9f2;
    border-radius:999px;padding:8px 12px;font-family:'Manrope',sans-serif;font-size:12px;font-weight:700;
    color:#061B45;cursor:pointer;box-shadow:0 6px 18px rgba(6,27,69,.12);display:none}
  `;
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function quitar() { var b = document.getElementById('cky-banner'); if (b) b.remove(); }
  function mostrarFab() {
    if (document.getElementById('cky-fab')) { document.getElementById('cky-fab').style.display = 'block'; return; }
    var f = document.createElement('button'); f.id = 'cky-fab'; f.textContent = '🍪 Cookies';
    f.style.display = 'block'; f.onclick = function () { f.style.display = 'none'; render(true); };
    document.body.appendChild(f);
  }

  function render(config) {
    quitar();
    var prev = leer() || { necesarias: true, analiticas: false };
    var b = document.createElement('div'); b.id = 'cky-banner';
    b.innerHTML =
      '<h3>Tu privacidad nos importa</h3>' +
      '<p>Usamos cookies técnicas necesarias y, con tu permiso, cookies analíticas para mejorar el sitio. ' +
      'Consulta nuestra <a href="/legal/cookies.html">Política de cookies</a> y la ' +
      '<a href="/legal/privacidad.html">Política de privacidad</a>.</p>' +
      (config ?
        '<div class="cky-panel">' +
          '<div class="cky-row"><input type="checkbox" checked disabled><span><b>Necesarias.</b> Imprescindibles para el funcionamiento. Siempre activas.</span></div>' +
          '<div class="cky-row"><input type="checkbox" id="cky-an" ' + (prev.analiticas ? 'checked' : '') + '><span><b>Analíticas.</b> Nos ayudan a entender el uso del sitio de forma anónima.</span></div>' +
        '</div>' : '') +
      '<div class="cky-btns">' +
        (config ? '' : '<button class="cky-cfg" id="cky-config">Configurar</button>') +
        '<button class="cky-rej" id="cky-reject">Rechazar</button>' +
        '<button class="cky-acc" id="cky-accept">' + (config ? 'Guardar' : 'Aceptar todo') + '</button>' +
      '</div>';
    document.body.appendChild(b);

    var accept = document.getElementById('cky-accept');
    var reject = document.getElementById('cky-reject');
    var cfg = document.getElementById('cky-config');
    if (cfg) cfg.onclick = function () { render(true); };
    accept.onclick = function () {
      var an = config ? !!(document.getElementById('cky-an') && document.getElementById('cky-an').checked) : true;
      guardar({ necesarias: true, analiticas: an, ts: Date.now() }); aplicarConsentGTM(an); quitar(); mostrarFab();
    };
    reject.onclick = function () {
      guardar({ necesarias: true, analiticas: false, ts: Date.now() }); aplicarConsentGTM(false); quitar(); mostrarFab();
    };
  }

  // Comunica la elección a Google Consent Mode v2 (si GTM está presente).
  function aplicarConsentGTM(analiticas) {
    if (typeof window.gtag !== 'function') return;
    var estado = analiticas ? 'granted' : 'denied';
    window.gtag('consent', 'update', {
      'analytics_storage': estado,
      'ad_storage': estado,
      'ad_user_data': estado,
      'ad_personalization': estado
    });
  }

  // Mostrar solo si no hay elección previa; si la hay, dejar el botón flotante para revisarla.
  document.addEventListener('DOMContentLoaded', function () {
    if (!leer()) render(false); else mostrarFab();
  });
  // Permite abrir el panel desde un enlace "Configurar cookies" con id="abrir-cookies"
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#abrir-cookies, .abrir-cookies');
    if (t) { e.preventDefault(); render(true); }
  });
})();
