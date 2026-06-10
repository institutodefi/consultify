# -*- coding: utf-8 -*-
"""Aplica el nuevo modelo de precios y narrativa Apoyo a public-site/index.html.
Cada reemplazo verifica el número exacto de ocurrencias antes de aplicarse."""
import sys, io

PATH = "/home/claude/consultify-web/public-site/index.html"
with io.open(PATH, "r", encoding="utf-8") as f:
    html = f.read()

errors = []

def rep(old, new, count=1):
    global html
    found = html.count(old)
    if found != count:
        errors.append(f"[{found}!={count}] {old[:90]}")
        return
    html = html.replace(old, new)

# ============ A. MODEL CARDS (precios desde) ============
rep('<span class="price-num" data-keep-ltr>199</span>', '<span class="price-num" data-keep-ltr>350</span>')
rep('<span class="price-num" data-keep-ltr>349</span>', '<span class="price-num" data-keep-ltr>625</span>')
rep('<span class="price-num" data-keep-ltr>549</span>', '<span class="price-num" data-keep-ltr>800</span>')

# ============ B. JSON-LD Offers ============
rep('"199.00"', '"350.00"', 2)
rep('"349.00"', '"625.00"', 2)
rep('"549.00"', '"800.00"', 2)

# ============ C. TABLA PRICING POR NORMA ============
P = '<span class="from" data-i18n="pricing.from">desde</span><span data-keep-ltr>%s</span>'
for old, new in [("199","350"),("349","625"),("549","800"),
                 ("329","350"),("609","625"),("919","800"),
                 ("519","350"),("1.009","475"),("1.579","600"),
                 ("449","350"),("659","475"),("1.049","600")]:
    rep(P % old, P % new)

# ============ D. SECCIÓN IMPL → APOYO: precios individuales ============
for old, new in [("3.839","3.400"),("6.699","4.500"),("11.099","6.000"),("7.249","4.700"),
                 ("9.999","7.800"),("19.459","13.800"),("16.049","12.400"),("24.519","18.300")]:
    rep('<div class="impl-price"><span data-keep-ltr>%s</span><span>€</span></div>' % old,
        '<div class="impl-price"><span data-keep-ltr>%s</span><span>€</span></div>' % new)

# Tiempo: "≈ N semanas" → horas de consultoría incluidas
T = '<div class="impl-time"><span data-keep-ltr>≈ %s</span> <span data-i18n="impl.weeks">semanas</span></div>'
N = '<div class="impl-time"><span data-keep-ltr>%s h</span> <span data-i18n="impl.weeks">de consultoría incluidas</span></div>'
for w, h in [("4","38"),("7","51"),("12","90"),("8","70"),
             ("11","88"),("21","178"),("17","158"),("26","247")]:
    rep(T % w, N % h)

# Pace: "16 h/sem · pago único" → "Prepago 100% · pago único" (8 tarjetas)
rep('<span data-keep-ltr>16 h</span>/<span data-i18n="impl.week">sem</span> · <span data-i18n="impl.oneoff">pago único</span>',
    '<span data-i18n="impl.oneoff">Prepago 100% · pago único</span>', 8)

# Badges combos: descuento % → horas totales
rep('<div class="impl-badge" data-keep-ltr>−5%</div>\n        <div class="impl-norm" data-keep-ltr>9001 + 14001</div>',
    '<div class="impl-badge" data-keep-ltr>88 h</div>\n        <div class="impl-norm" data-keep-ltr>9001 + 14001</div>')
rep('<div class="impl-badge" data-keep-ltr>−10%</div>\n        <div class="impl-norm" data-keep-ltr>9001 + 14001 + 27001</div>',
    '<div class="impl-badge" data-keep-ltr>178 h</div>\n        <div class="impl-norm" data-keep-ltr>9001 + 14001 + 27001</div>')
rep('<div class="impl-badge" data-keep-ltr>−10%</div>\n        <div class="impl-norm" data-keep-ltr>9001 + 14001 + 45001</div>',
    '<div class="impl-badge" data-keep-ltr>158 h</div>\n        <div class="impl-norm" data-keep-ltr>9001 + 14001 + 45001</div>')
rep('<div class="impl-badge max" data-keep-ltr>−15%</div>',
    '<div class="impl-badge max" data-keep-ltr>247 h</div>')

# ============ E. TABLA COMBOS (mensuales) ============
C = '<span data-keep-ltr>%s</span><span class="per">€/'
for old, new in [("499","450"),("909","975"),("1.399","1.425"),
                 ("939","575"),("1.769","1.325"),("2.739","1.800"),
                 ("879","575"),("1.459","1.325"),("2.269","1.800"),
                 ("1.269","700"),("2.229","1.575"),("3.479","2.275")]:
    rep(C % old, C % new)
# Ahorro real vs suma individual (sobre Implicación)
rep('<td><span data-keep-ltr>−5%</span></td>', '<td><span data-keep-ltr>−22%</span></td>')
rep('<td><span data-keep-ltr>−10%</span></td>', '<td><span data-keep-ltr>−23%</span></td>', 2)
rep('<td><span data-keep-ltr>−15%</span></td>', '<td><span data-keep-ltr>−28%</span></td>')

# ============ F. METAS Y CLAIMS ============
rep('<meta name="description" content="El Spotify de la consultoría. Implanta normas ISO 9001, 14001, 27001, 45001 en tiempo récord — desde 4 semanas a 16 h/semana. Suscripción mensual prepago desde 199€/mes. Sin permanencia." />',
    '<meta name="description" content="El Spotify de la consultoría. Implanta y mantén normas ISO 9001, 14001, 27001, 45001 en tiempo récord con consultores potenciados por IA. Suscripción mensual prepago desde 350€/mes. Permanencia mínima 12 meses." />')
rep('<meta property="og:description" content="El Spotify de la consultoría. Implanta ISO en tiempo récord — desde 4 semanas a 16 h/semana. Modelo prepago desde 199€/mes." />',
    '<meta property="og:description" content="El Spotify de la consultoría. Implanta ISO en tiempo récord con consultores potenciados por IA. Modelo prepago desde 350€/mes." />')
rep('<meta name="twitter:description" content="El Spotify de la consultoría. Certifica ISO en tiempo récord — desde 4 semanas. Modelo prepago desde 199€/mes." />',
    '<meta name="twitter:description" content="El Spotify de la consultoría. Certifica ISO en tiempo récord. Modelo prepago desde 350€/mes." />')

# FAQ a1 (HTML + JSON-LD + dict ES) — texto idéntico en 3 sitios
rep('Sí. Pagas el primer mes por adelantado y arranca tu suscripción. Cada mes siguiente se cobra al inicio del período. Sin permanencia: cancelas cuando quieras y sigues activo hasta el fin del mes pagado.',
    'Sí. Pagas el primer mes por adelantado y arranca tu suscripción. Cada mes siguiente se cobra al inicio del período. Los modelos recurrentes tienen una permanencia mínima de 12 meses.', 3)
rep("'faq.a1': 'Yes. You pay for the first month upfront and your subscription begins. Each subsequent month is charged at the start of the period. No commitment: cancel anytime and remain active until the end of the paid month.',",
    "'faq.a1': 'Yes. You pay for the first month upfront and your subscription begins. Each subsequent month is charged at the start of the period. Recurring plans have a 12-month minimum commitment.',")
rep("'faq.a1': 'نعم. تدفع الشهر الأول مقدمًا ويبدأ اشتراكك. كل شهر تالٍ يُحسب في بداية الفترة. بدون التزام: ألغِ متى شئت وتبقى نشطًا حتى نهاية الشهر المدفوع.',",
    "'faq.a1': 'نعم. تدفع الشهر الأول مقدمًا ويبدأ اشتراكك. كل شهر تالٍ يُحسب في بداية الفترة. الباقات الشهرية تتطلب التزامًا لمدة 12 شهرًا كحد أدنى.',")

# FAQ a2 (HTML + JSON-LD ES idénticos ×2, EN dict, AR dict, ES dict aparte)
rep('Depende del ritmo. A 16 horas semanales de dedicación, una norma se implanta en 4–12 semanas (ISO 9001 ≈ 4 semanas, ISO 27001 ≈ 12 semanas). El sistema integrado completo (las 4 normas) en ≈ 26 semanas. A un ritmo más relajado puede extenderse hasta 11 meses. Tú eliges la cadencia.',
    'Con el modelo Apoyo contratas una bolsa de horas prepagada que cubre la implantación completa: ISO 9001 (38 h), ISO 14001 (51 h), ISO 45001 (70 h), ISO 27001 (90 h). El sistema integrado de 4 normas incluye 247 h. El ritmo lo marcas tú con tu consultor; el acompañamiento a auditoría se contrata aparte (600 €/jornada).', 2)
rep('Depende del ritmo. A 16 horas semanales de dedicación, una norma se implanta en 4–12 semanas (ISO 9001 ≈ 4 semanas, ISO 14001 ≈ 7 semanas, ISO 45001 ≈ 8 semanas, ISO 27001 ≈ 12 semanas). El sistema integrado completo (las 4 normas) en ≈ 26 semanas. A un ritmo más relajado puede extenderse hasta 11 meses. Tú eliges la cadencia.',
    'Con el modelo Apoyo contratas una bolsa de horas prepagada que cubre la implantación completa: ISO 9001 (38 h), ISO 14001 (51 h), ISO 45001 (70 h), ISO 27001 (90 h). El sistema integrado de 4 normas incluye 247 h. El ritmo lo marcas tú con tu consultor; el acompañamiento a auditoría se contrata aparte (600 €/jornada).', 1)
rep("'faq.a2': 'Depends on the pace. At 16 hours per week of dedication, a single standard is implemented in 4–12 weeks (ISO 9001 ≈ 4 weeks, ISO 27001 ≈ 12 weeks). The full integrated system (all 4 standards) in ≈ 26 weeks. At a more relaxed pace it may extend up to 11 months. You choose the cadence.',",
    "'faq.a2': 'With the Apoyo model you purchase a prepaid bank of hours covering the full implementation: ISO 9001 (38 h), ISO 14001 (51 h), ISO 45001 (70 h), ISO 27001 (90 h). The full 4-standard integrated system includes 247 h. You set the pace with your consultant; audit accompaniment is contracted separately (€600/day).',")
rep("'faq.a2': 'يعتمد على الإيقاع. بمعدل 16 ساعة أسبوعيًا من التفرغ، يُطبَّق المعيار الواحد خلال 4–12 أسبوعًا (الأيزو 9001 ≈ 4 أسابيع، الأيزو 27001 ≈ 12 أسبوعًا). النظام المتكامل الكامل (المعايير الأربعة) خلال 26 أسبوعًا تقريبًا. وبإيقاع أكثر استرخاءً يمكن أن يمتد حتى 11 شهرًا. أنت تختار الإيقاع.',",
    "'faq.a2': 'مع نموذج «أبويو» تشتري رصيدًا مسبق الدفع من الساعات يغطي التطبيق الكامل: أيزو 9001 (38 ساعة)، أيزو 14001 (51 ساعة)، أيزو 45001 (70 ساعة)، أيزو 27001 (90 ساعة). النظام المتكامل من 4 معايير يشمل 247 ساعة. أنت تحدد الإيقاع مع مستشارك؛ ومرافقة التدقيق تُتعاقد بشكل منفصل (600 يورو/يوم).',")

# hero.sub.2 (HTML + dict ES)
rep(' Modelo prepago. Sin permanencia. Sin sorpresas.', ' Modelo prepago. Precio cerrado. Sin sorpresas.', 2)
rep("' Prepaid model. No commitment. No surprises.'", "' Prepaid model. Fixed pricing. No surprises.'")
rep("' نموذج دفع مسبق. بدون التزام. بدون مفاجآت.'", "' نموذج دفع مسبق. سعر ثابت. بدون مفاجآت.'")

# pricing.lead (HTML + dict ES)
rep('Tarifas mensuales prepago. IVA no incluido. Cancela cuando quieras.',
    'Tarifas mensuales prepago. IVA no incluido. Permanencia mínima 12 meses.', 2)
rep("'pricing.lead': 'Monthly prepaid fees. VAT not included. Cancel anytime.',",
    "'pricing.lead': 'Monthly prepaid fees. VAT not included. 12-month minimum commitment.',")
rep("'pricing.lead': 'رسوم شهرية بالدفع المسبق. ضريبة القيمة المضافة غير مشمولة. ألغِ متى شئت.',",
    "'pricing.lead': 'رسوم شهرية بالدفع المسبق. ضريبة القيمة المضافة غير مشمولة. التزام لمدة 12 شهرًا كحد أدنى.',")

# how.s3 (HTML + dict ES)
rep('Avanzas y cancelas cuando quieras', 'Avanzas mes a mes con tu consultor', 2)
rep("'how.s3.t': 'Move forward, cancel anytime',", "'how.s3.t': 'Move forward month by month',")
rep("'how.s3.t': 'تتقدم وتلغي متى شئت',", "'how.s3.t': 'تتقدم شهرًا بعد شهر مع مستشارك',")
rep('Pagas solo los meses que necesitas. Implantación típica en 11 meses hasta certificación. Después, mantenimiento ágil.',
    'Cuota mensual fija y prepagada. Implantación en tiempo récord hasta certificación. Después, mantenimiento ágil con tu modelo de suscripción.', 2)
rep("'how.s3.p': 'Pay only for the months you need. Typical implementation takes 11 months until certification. Then, agile maintenance.',",
    "'how.s3.p': 'Fixed, prepaid monthly fee. Record-time implementation through certification. Then, agile maintenance on your subscription plan.',")
rep("'how.s3.p': 'تدفع فقط مقابل الأشهر التي تحتاجها. التطبيق النموذجي يستغرق 11 شهرًا حتى الحصول على الشهادة. ثم صيانة سريعة.',",
    "'how.s3.p': 'رسوم شهرية ثابتة بالدفع المسبق. تطبيق في وقت قياسي حتى الحصول على الشهادة. ثم صيانة سريعة ضمن باقة اشتراكك.',")

# CTA final (HTML + dict ES)
rep('<span class="accent" data-i18n="cta.title.2">Cancela cuando quieras.</span>',
    '<span class="accent" data-i18n="cta.title.2">Certifícate en tiempo récord.</span>')
rep("'cta.title.2': 'Cancela cuando quieras.',", "'cta.title.2': 'Certifícate en tiempo récord.',")
rep("'cta.title.2': 'Cancel anytime.',", "'cta.title.2': 'Certify in record time.',")
rep("'cta.title.2': 'ألغِ متى شئت.',", "'cta.title.2': 'احصل على شهادتك في وقت قياسي.',")
rep('Modelo prepago de suscripción mensual. Sin permanencia. Como Spotify, pero para tu cuenta de resultados.',
    'Modelo prepago de suscripción mensual con permanencia mínima de 12 meses. Como Spotify, pero para tu cuenta de resultados.', 2)
rep("'cta.body': 'Prepaid monthly subscription model. No commitment. Like Spotify, but for your bottom line.',",
    "'cta.body': 'Prepaid monthly subscription model with a 12-month minimum commitment. Like Spotify, but for your bottom line.',")
rep("'cta.body': 'نموذج اشتراك شهري بالدفع المسبق. بدون التزام. مثل سبوتيفاي، ولكن لميزانيتك.',",
    "'cta.body': 'نموذج اشتراك شهري بالدفع المسبق مع التزام لمدة 12 شهرًا كحد أدنى. مثل سبوتيفاي، ولكن لميزانيتك.',")

# description dicts (ES/EN/AR)
rep("description: 'El Spotify de la consultoría. Implanta normas ISO 9001, 14001, 27001, 45001 en tiempo récord — desde 4 semanas a 16 h/semana. Suscripción mensual prepago desde 199€/mes. Sin permanencia.',",
    "description: 'El Spotify de la consultoría. Implanta y mantén normas ISO 9001, 14001, 27001, 45001 en tiempo récord con consultores potenciados por IA. Suscripción mensual prepago desde 350€/mes. Permanencia mínima 12 meses.',")
rep("description: 'The Spotify of consulting. Implement ISO 9001, 14001, 27001, 45001 in record time — from 4 weeks at 16 h/week. Monthly prepaid subscription from €199/month. No commitment.',",
    "description: 'The Spotify of consulting. Implement and maintain ISO 9001, 14001, 27001, 45001 in record time with AI-powered consultants. Monthly prepaid subscription from €350/month. 12-month minimum commitment.',")
rep("description: 'سبوتيفاي الاستشارات. طبّق معايير الأيزو 9001 و14001 و27001 و45001 في وقت قياسي — ابتداءً من 4 أسابيع بمعدل 16 ساعة/أسبوع. اشتراك شهري بالدفع المسبق ابتداءً من 199 يورو/شهر. بدون التزام.',",
    "description: 'سبوتيفاي الاستشارات. طبّق معايير الأيزو 9001 و14001 و27001 و45001 في وقت قياسي مع مستشارين مدعومين بالذكاء الاصطناعي. اشتراك شهري بالدفع المسبق ابتداءً من 350 يورو/شهر. التزام لمدة 12 شهرًا كحد أدنى.',")

# ============ G. SECCIÓN IMPLANTACIÓN → APOYO (narrativa) ============
rep('<div class="section-eyebrow" data-i18n="impl.eyebrow">Implantación · pago único</div>',
    '<div class="section-eyebrow" data-i18n="impl.eyebrow">Apoyo · bolsa de horas prepagada</div>')
rep("'impl.eyebrow': 'Implantación · pago único',", "'impl.eyebrow': 'Apoyo · bolsa de horas prepagada',")
rep("'impl.eyebrow': 'Implementation · one-off payment',", "'impl.eyebrow': 'Apoyo · prepaid bank of hours',")
rep("'impl.eyebrow': 'التطبيق · دفعة واحدة',", "'impl.eyebrow': '«أبويو» · رصيد ساعات مسبق الدفع',")

rep('<span data-i18n="impl.title.1">Si empiezas de 0,</span>', '<span data-i18n="impl.title.1">Modelo Apoyo:</span>')
rep("'impl.title.1': 'Si empiezas de 0,',", "'impl.title.1': 'Modelo Apoyo:',")
rep("'impl.title.1': 'Starting from scratch?',", "'impl.title.1': 'Apoyo model:',")
rep("'impl.title.1': 'إذا بدأت من الصفر،',", "'impl.title.1': 'نموذج «أبويو»:',")

rep('<span class="strong" data-i18n="impl.title.2">certificas en tiempo récord.</span>',
    '<span class="strong" data-i18n="impl.title.2">tu implantación, prepagada.</span>')
rep("'impl.title.2': 'certificas en tiempo récord.',", "'impl.title.2': 'tu implantación, prepagada.',")
rep("'impl.title.2': 'Certify in record time.',", "'impl.title.2': 'your implementation, prepaid.',")
rep("'impl.title.2': 'تحصل على الشهادة في وقت قياسي.',", "'impl.title.2': 'تطبيقك، مسبق الدفع.',")

LEAD_ES = 'Bolsa de horas prepagada al 100% que cubre la implantación completa de tu sistema. Precio cerrado por norma, sin sorpresas. No contratable a menos de 60 días de tu auditoría externa. Acompañamiento a auditoría aparte: 600 €/jornada.'
rep('<p class="lead" data-i18n="impl.lead">Misma tarifa, ritmo intensivo. A <strong>16 horas semanales</strong> de dedicación, tu sistema de gestión queda implantado en cuestión de semanas — no de años. Comprimes meses de proyecto sin pagar más.</p>',
    '<p class="lead" data-i18n="impl.lead">' + LEAD_ES + '</p>')
rep("'impl.lead': 'Misma tarifa, ritmo intensivo. A 16 horas semanales de dedicación, tu sistema de gestión queda implantado en cuestión de semanas — no de años. Comprimes meses de proyecto sin pagar más.',",
    "'impl.lead': '" + LEAD_ES + "',")
rep("'impl.lead': 'Same price, intensive pace. At 16 hours per week of dedication, your management system is implemented in a matter of weeks — not years. Compress months of project work without paying more.',",
    "'impl.lead': '100% prepaid bank of hours covering your full system implementation. Fixed price per standard, no surprises. Cannot be contracted within 60 days of your external audit. Audit accompaniment billed separately: €600/day.',")
rep("'impl.lead': 'نفس السعر، إيقاع مكثف. بمعدل 16 ساعة أسبوعيًا من التفرغ، يكون نظام إدارتك جاهزًا خلال أسابيع — لا سنوات. تضغط أشهرًا من العمل دون دفع المزيد.',",
    "'impl.lead': 'رصيد ساعات مدفوع مسبقًا بنسبة 100% يغطي التطبيق الكامل لنظامك. سعر ثابت لكل معيار، بدون مفاجآت. لا يمكن التعاقد عليه قبل أقل من 60 يومًا من التدقيق الخارجي. مرافقة التدقيق تُحسب بشكل منفصل: 600 يورو/يوم.',")

rep('<p class="impl-subdesc" data-i18n="impl.indiv.desc">Implanta una sola norma ISO desde cero. Pago único · ritmo de 16 h/semana.</p>',
    '<p class="impl-subdesc" data-i18n="impl.indiv.desc">Implanta una sola norma ISO desde cero. Bolsa de horas cerrada · prepago 100%.</p>')
rep("'impl.indiv.desc': 'Implanta una sola norma ISO desde cero. Pago único · ritmo de 16 h/semana.',",
    "'impl.indiv.desc': 'Implanta una sola norma ISO desde cero. Bolsa de horas cerrada · prepago 100%.',")
rep("'impl.indiv.desc': 'Implement a single ISO standard from scratch. One-off payment · 16 h/week pace.',",
    "'impl.indiv.desc': 'Implement a single ISO standard from scratch. Fixed bank of hours · 100% prepaid.',")
rep("'impl.indiv.desc': 'طبّق معيار أيزو واحدًا من الصفر. دفعة واحدة · إيقاع 16 ساعة/أسبوع.',",
    "'impl.indiv.desc': 'طبّق معيار أيزو واحدًا من الصفر. رصيد ساعات محدد · دفع مسبق 100%.',")

rep('<p class="impl-subdesc" data-i18n="impl.combo.desc">Implanta varios sistemas a la vez con descuento por integración: 2 sistemas −5%, 3 sistemas −10%, 4 sistemas −15%. Mismo ritmo intensivo.</p>',
    '<p class="impl-subdesc" data-i18n="impl.combo.desc">Implanta varios sistemas a la vez: las horas comunes se comparten y el precio integrado es menor que la suma de normas por separado.</p>')
rep("'impl.combo.desc': 'Implanta varios sistemas a la vez con descuento por integración: 2 sistemas −5%, 3 sistemas −10%, 4 sistemas −15%. Mismo ritmo intensivo.',",
    "'impl.combo.desc': 'Implanta varios sistemas a la vez: las horas comunes se comparten y el precio integrado es menor que la suma de normas por separado.',")
old_en_combo = html[html.find("'impl.combo.desc': 'Implement"):]
# EN/AR combo.desc: replace by key prefix lookup
import re
html = re.sub(r"'impl\.combo\.desc': 'Implement[^']*',",
              "'impl.combo.desc': 'Implement several systems at once: shared hours are pooled and the integrated price is lower than the sum of individual standards.',", html, count=1)
html = re.sub(r"'impl\.combo\.desc': 'طبّق[^']*',",
              "'impl.combo.desc': 'طبّق عدة أنظمة في آن واحد: الساعات المشتركة تُجمَّع والسعر المتكامل أقل من مجموع المعايير المنفصلة.',", html, count=1)

# impl.weeks / impl.oneoff dict values
rep("'impl.weeks': 'semanas',", "'impl.weeks': 'de consultoría incluidas',")
rep("'impl.weeks': 'weeks',", "'impl.weeks': 'of consulting included',")
rep("'impl.weeks': 'أسابيع',", "'impl.weeks': 'ساعة استشارات مشمولة',")
rep("'impl.oneoff': 'pago único',", "'impl.oneoff': 'Prepago 100% · pago único',")
rep("'impl.oneoff': 'one-off payment',", "'impl.oneoff': '100% prepaid · one-off payment',")
rep("'impl.oneoff': 'دفعة واحدة',", "'impl.oneoff': 'دفع مسبق 100% · دفعة واحدة',")

# nav.implantacion → Apoyo
rep('<a href="#implantacion" data-i18n="nav.implantacion">Implantación</a>',
    '<a href="#implantacion" data-i18n="nav.implantacion">Apoyo</a>')
rep("'nav.implantacion': 'Implantación',", "'nav.implantacion': 'Apoyo',")
rep("'nav.implantacion': 'Implementation',", "'nav.implantacion': 'Apoyo',")
rep("'nav.implantacion': 'التطبيق',", "'nav.implantacion': '«أبويو»',")

# ============ H. COMBOS sección recurrente ============
rep('<div class="section-eyebrow dark" data-i18n="combos.eyebrow">Combos integrados · Descuento por nº de sistemas</div>',
    '<div class="section-eyebrow dark" data-i18n="combos.eyebrow">Combos integrados · Ahorro real por integración</div>')
rep("'combos.eyebrow': 'Combos integrados · Descuento por nº de sistemas',",
    "'combos.eyebrow': 'Combos integrados · Ahorro real por integración',")
rep("'combos.eyebrow': 'Integrated bundles · Discount by number of systems',",
    "'combos.eyebrow': 'Integrated bundles · Real savings through integration',")
rep("'combos.eyebrow': 'الباقات المتكاملة · خصم حسب عدد الأنظمة',",
    "'combos.eyebrow': 'الباقات المتكاملة · توفير حقيقي عبر التكامل',")

COMBOS_LEAD = 'Precio integrado calculado sobre las horas reales de dedicación: cuantos más sistemas integras, mayor el ahorro frente a contratarlos por separado.'
rep('<p class="lead" data-i18n="combos.lead">Descuento plano: 2 sistemas −5%, 3 sistemas −10%, 4 sistemas −15%.</p>',
    '<p class="lead" data-i18n="combos.lead">' + COMBOS_LEAD + '</p>')
rep("'combos.lead': 'Descuento plano: 2 sistemas −5%, 3 sistemas −10%, 4 sistemas −15%.',",
    "'combos.lead': '" + COMBOS_LEAD + "',")
html = re.sub(r"'combos\.lead': 'Flat discount[^']*',",
              "'combos.lead': 'Integrated pricing based on real dedicated hours: the more systems you integrate, the bigger the savings versus contracting them separately.',", html, count=1)
html = re.sub(r"'combos\.lead': 'خصم[^']*',",
              "'combos.lead': 'تسعير متكامل محسوب على ساعات العمل الفعلية: كلما زادت الأنظمة التي تدمجها، زاد التوفير مقارنة بالتعاقد عليها بشكل منفصل.',", html, count=1)

# ============ I. NAV + HERO + FOOTER: enlaces a la app ============
rep('<a href="#faq" data-i18n="nav.faq">FAQ</a>\n    </div>\n    <div class="nav-right">',
    '<a href="#faq" data-i18n="nav.faq">FAQ</a>\n      <a href="/app/calculadora" data-i18n="nav.calc">Calculadora</a>\n    </div>\n    <div class="nav-right">')
rep('<a href="#cta" class="btn btn-orange" data-i18n="nav.cta">Activar suscripción</a>',
    '<a href="/app/acceso" class="btn" style="margin-right:8px" data-i18n="nav.access">Acceso</a>\n      <a href="/app/calculadora" class="btn btn-orange" data-i18n="nav.cta">Calcula tu precio</a>')
rep('<a href="#pricing" class="btn btn-primary" data-i18n="hero.cta1">Ver tarifas</a>',
    '<a href="/app/calculadora" class="btn btn-primary" data-i18n="hero.cta1">Calcula tu precio</a>')

# i18n nuevas claves + cta/hero (insertar tras nav.cta de cada idioma)
rep("'nav.cta': 'Activar suscripción',", "'nav.cta': 'Calcula tu precio',\n    'nav.calc': 'Calculadora',\n    'nav.access': 'Acceso',")
html = re.sub(r"'nav\.cta': 'Activate subscription',", "'nav.cta': 'Calculate your price',\n    'nav.calc': 'Calculator',\n    'nav.access': 'Log in',", html, count=1)
html = re.sub(r"'nav\.cta': '[^']*اشتراك[^']*',", "'nav.cta': 'احسب سعرك',\n    'nav.calc': 'الحاسبة',\n    'nav.access': 'تسجيل الدخول',", html, count=1)
rep("'hero.cta1': 'Ver tarifas',", "'hero.cta1': 'Calcula tu precio',")
rep("'hero.cta1': 'See pricing',", "'hero.cta1': 'Calculate your price',")
rep("'hero.cta1': 'عرض الأسعار',", "'hero.cta1': 'احسب سعرك',")

# Footer: añadir enlace calculadora
rep('<a href="#faq" data-i18n="nav.faq">FAQ</a>\n      </div>\n      <div class="footer-col">\n        <h4 data-i18n="footer.contact">Contacto</h4>',
    '<a href="#faq" data-i18n="nav.faq">FAQ</a>\n        <a href="/app/calculadora" data-i18n="nav.calc">Calculadora</a>\n      </div>\n      <div class="footer-col">\n        <h4 data-i18n="footer.contact">Contacto</h4>')

# ============ RESULTADO ============
if errors:
    print("ERRORES (%d):" % len(errors))
    for e in errors:
        print("  " + e)
    sys.exit(1)

with io.open(PATH, "w", encoding="utf-8") as f:
    f.write(html)
print("OK — todos los reemplazos aplicados.")
