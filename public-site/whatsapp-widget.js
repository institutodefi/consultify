/* ===================================================================
   Consultify · WhatsApp floating widget (autónomo, multipágina)
   Uso: <script src="/whatsapp-widget.js" defer></script>
   - Detecta idioma desde <html lang> (es/en/ar) con fallback a 'es'
   - Inyecta su propio CSS + HTML, no requiere i18n de la página
   - Hora real del visitante en la burbuja
   - Envía eventos a dataLayer: whatsapp_open, whatsapp_send
   =================================================================== */
(function () {
  if (window.__waWidgetLoaded) return;
  window.__waWidgetLoaded = true;

  var PHONE = '34615478641';

  var lang = (document.documentElement.lang || 'es').toLowerCase().split('-')[0];
  if (['es', 'en', 'ar'].indexOf(lang) === -1) lang = 'es';
  var isRTL = (document.documentElement.dir === 'rtl') || lang === 'ar';

  var T = {
    es: {
      title: 'Consultify',
      status: 'En línea · responde en minutos',
      greeting: '¡Hola! 👋 Soy tu consultor Consultify. ¿Sobre qué norma ISO quieres información?',
      placeholder: 'Escribe tu mensaje…',
      send: 'Enviar por WhatsApp',
      aria_open: 'Abrir chat de WhatsApp',
      aria_close: 'Cerrar',
      defaultMsg: 'Hola, me interesa la consultoría ISO de Consultify. ¿Podéis darme más información?'
    },
    en: {
      title: 'Consultify',
      status: 'Online · replies in minutes',
      greeting: "Hi! 👋 I'm your Consultify advisor. Which ISO standard would you like to know about?",
      placeholder: 'Type your message…',
      send: 'Send via WhatsApp',
      aria_open: 'Open WhatsApp chat',
      aria_close: 'Close',
      defaultMsg: "Hi, I'm interested in Consultify's ISO consulting. Could you tell me more?"
    },
    ar: {
      title: 'Consultify',
      status: 'متصل · يرد خلال دقائق',
      greeting: 'مرحباً! 👋 أنا مستشارك في Consultify. عن أي معيار أيزو تريد المعلومات؟',
      placeholder: 'اكتب رسالتك…',
      send: 'أرسل عبر واتساب',
      aria_open: 'افتح محادثة واتساب',
      aria_close: 'إغلاق',
      defaultMsg: 'مرحباً، أنا مهتم باستشارات الأيزو من Consultify. هل يمكنكم إخباري بالمزيد؟'
    }
  };
  var t = T[lang];

  // Hora real del visitante (HH:MM 24h)
  function nowHM() {
    var d = new Date();
    var h = ('0' + d.getHours()).slice(-2);
    var m = ('0' + d.getMinutes()).slice(-2);
    return h + ':' + m;
  }

  // ---- CSS ----
  var css = '' +
  '.wa-fab{position:fixed;bottom:24px;right:24px;z-index:9998;width:60px;height:60px;border-radius:50%;background:#25D366;border:none;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease}' +
  '.wa-fab:hover{transform:scale(1.06);box-shadow:0 10px 28px rgba(0,0,0,.32)}' +
  '.wa-fab svg{width:32px;height:32px;fill:#fff}' +
  '.wa-fab .wa-dot{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#F5A623;color:#061B45;font-size:11px;font-weight:800;line-height:18px;text-align:center;border:2px solid #fff}' +
  '.wa-w-rtl .wa-fab{right:auto;left:24px}' +
  '.wa-popup{position:fixed;bottom:96px;right:24px;z-index:9999;width:320px;max-width:calc(100vw - 48px);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(6,27,69,.28);opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .22s ease,transform .22s ease;font-family:Manrope,system-ui,sans-serif}' +
  '.wa-popup.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}' +
  '.wa-w-rtl .wa-popup{right:auto;left:24px;direction:rtl}' +
  '.wa-head{background:#061B45;color:#fff;padding:16px 18px;display:flex;align-items:center;gap:12px;position:relative}' +
  '.wa-head .wa-avatar{width:40px;height:40px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
  '.wa-head .wa-avatar svg{width:22px;height:22px;fill:#fff}' +
  '.wa-head .wa-title{font-weight:700;font-size:15px;line-height:1.2}' +
  '.wa-head .wa-status{font-size:12px;color:#9db4e0;display:flex;align-items:center;gap:5px;margin-top:2px}' +
  '.wa-head .wa-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block}' +
  '.wa-close{position:absolute;top:12px;right:12px;background:transparent;border:none;color:#9db4e0;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px}' +
  '.wa-w-rtl .wa-close{right:auto;left:12px}' +
  '.wa-close:hover{color:#fff}' +
  '.wa-body{padding:18px;background:#ECE5DD}' +
  '.wa-bubble{background:#fff;border-radius:10px;padding:12px 14px;font-size:14px;color:#111;line-height:1.45;box-shadow:0 1px 2px rgba(0,0,0,.08);position:relative;max-width:90%}' +
  '.wa-bubble::before{content:"";position:absolute;top:0;left:-7px;border-width:0 8px 8px 0;border-style:solid;border-color:transparent #fff transparent transparent}' +
  '.wa-w-rtl .wa-bubble::before{left:auto;right:-7px;border-width:0 0 8px 8px;border-color:transparent transparent transparent #fff}' +
  '.wa-time{font-size:10px;color:#999;text-align:right;margin-top:4px}' +
  '.wa-w-rtl .wa-time{text-align:left}' +
  '.wa-foot{padding:14px 18px 18px;background:#fff}' +
  '.wa-input{width:100%;border:1px solid #d5d5d5;border-radius:22px;padding:11px 16px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box}' +
  '.wa-input:focus{border-color:#0A2A6C}' +
  '.wa-send{margin-top:10px;width:100%;border:none;border-radius:22px;cursor:pointer;background:#25D366;color:#fff;font-weight:700;font-size:15px;font-family:inherit;padding:12px;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .18s ease}' +
  '.wa-send:hover{background:#1eb855}' +
  '.wa-send svg{width:18px;height:18px;fill:#fff}' +
  '@media (max-width:480px){.wa-fab{bottom:16px;right:16px}.wa-w-rtl .wa-fab{left:16px;right:auto}.wa-popup{bottom:84px;right:16px}.wa-w-rtl .wa-popup{left:16px;right:auto}}';

  var WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    if (isRTL) wrap.className = 'wa-w-rtl';
    wrap.innerHTML =
      '<button class="wa-fab" id="waFab" aria-label="' + t.aria_open + '" type="button">' + WA_ICON +
        '<span class="wa-dot">1</span></button>' +
      '<div class="wa-popup" id="waPopup" role="dialog" aria-label="' + t.title + '" aria-modal="false">' +
        '<div class="wa-head">' +
          '<div class="wa-avatar">' + WA_ICON + '</div>' +
          '<div><div class="wa-title">' + t.title + '</div>' +
          '<div class="wa-status">' + t.status + '</div></div>' +
          '<button class="wa-close" id="waClose" aria-label="' + t.aria_close + '" type="button">&times;</button>' +
        '</div>' +
        '<div class="wa-body"><div class="wa-bubble">' +
          '<span>' + t.greeting + '</span>' +
          '<div class="wa-time">' + nowHM() + '</div>' +
        '</div></div>' +
        '<div class="wa-foot">' +
          '<input type="text" class="wa-input" id="waInput" placeholder="' + t.placeholder + '" autocomplete="off" />' +
          '<button class="wa-send" id="waSend" type="button">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '<span>' + t.send + '</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var fab = wrap.querySelector('#waFab');
    var popup = wrap.querySelector('#waPopup');
    var closeBtn = wrap.querySelector('#waClose');
    var input = wrap.querySelector('#waInput');
    var sendBtn = wrap.querySelector('#waSend');
    var dot = fab.querySelector('.wa-dot');

    function push(name, params) {
      try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, params || {})); } catch (e) {}
    }
    function openPopup() {
      popup.classList.add('open');
      if (dot) dot.style.display = 'none';
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 250);
      push('whatsapp_open', {});
    }
    function closePopup() { popup.classList.remove('open'); }

    fab.addEventListener('click', function () {
      popup.classList.contains('open') ? closePopup() : openPopup();
    });
    closeBtn.addEventListener('click', closePopup);

    function send() {
      var msg = (input.value || '').trim();
      if (!msg) msg = t.defaultMsg;
      var url = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg);
      push('whatsapp_send', { message_len: msg.length, page_lang: lang });
      window.open(url, '_blank', 'noopener');
      input.value = '';
      closePopup();
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
