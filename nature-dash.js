/* SH✡MER Nature view of the dashboard. Same page, same engine and the same account as the
   Person view (dashboard.html): CLIENT, the board review store (_boardLoad / _boardSave),
   the live rows (window._lastLive, window._revReal), ESC, the Israel-time helpers and the
   packages panel all come from dashboard.html. Case logic lives in nature-cases.js.

   For: field coordinators, rangers / volunteers, environmental bodies.
   Shows: hazard type, location in the field (~1 km), documentation, outcome.
   Never: a name, an account id or a precise location (CLAUDE.md privacy policy, 2026-10-28).
   Demo data is labelled "נתוני הדגמה" everywhere it appears. */
(function () {
  'use strict';
  var C = window.NatureCases;
  var NatDash = window.NatDash = {};
  var VIEW = 'person', LANG = 'he', F = { type: 'all', area: 'all', status: 'active' };
  var NMAP = null, NLAYER = null, SEL = null, _seenBridge = {};
  var BRIDGE = 'shomer_preview_nature_v1', BRIDGE_ST = 'shomer_preview_nature_st_v1';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ── words (HE / AR / EN) ── */
  var W = {
    he: {
      title: 'SH✡MER Nature · לוח שטח', tag: 'שומרים על מי שאין לו קול',
      demo: 'נתוני הדגמה', live: 'נתוני רשת', pv: 'תצוגה מקדימה · מקומי',
      k_open: 'פתוחים', k_open_m: 'דווחו וממתינים לשיבוץ', k_enroute: 'בדרך', k_enroute_m: 'צוות או מתנדב בדרך',
      k_handled: 'טופלו', k_handled_m: 'ממתינים לסגירה', k_closed: 'נסגרו · 30 יום', k_closed_m: 'עם תוצאה מתועדת',
      k_tth: 'זמן טיפול חציוני', k_tth_m: 'מדיווח ועד טיפול', k_doc: 'עם תיעוד', k_doc_m: 'תמונה או הערה',
      cases: 'תיקים', f_type: 'סוג', f_area: 'אזור', f_status: 'מצב', all: 'הכל', active: 'פעילים', out_area: 'מחוץ לאזורים',
      map: 'מפת שטח', map_note: 'כל נקודה היא מיקום מקורב (~1 ק״מ)', by_type: 'לפי סוג מפגע', cases_n: 'תיקים', med: 'חציון',
      flow: 'מחזור חיי תיק', plan: 'חבילה', plan_on: 'פעיל בחשבון:', p_person: 'שכבת אדם', p_nature: 'שכבת טבע', p_both: 'חבילה משולבת',
      plan_txt: 'שלוש חבילות: אדם, טבע, ומשולבת. אין חיוב כפול. המחיר לפי גודל וסוג הארגון: עוד לא נקבע.', plan_btn: '📦 חבילות',
      export: '⤓ דוח', csv: 'CSV', reset: 'איפוס הדגמה',
      empty: 'אין תיקים שמתאימים לסינון.', empty_live: 'אין עדיין דיווחי טבע באזור. כשיגיע דיווח הוא יופיע כאן ועל המפה.',
      s_open: 'דווח', s_enroute: 'בדרך', s_handled: 'טופל', s_closed: 'נסגר',
      a_enroute: 'שיבוץ · יוצאים לשטח', a_handled: 'סימון: טופל', a_close: 'סגירת תיק', a_reopen: 'פתיחה מחדש',
      outcome: 'מה היה הסוף?', pick: 'בחרו תוצאה', note: 'הערה קצרה (לא חובה)', note_ph: 'מה נעשה בשטח?',
      d_when: 'דווח', d_area: 'אזור', d_loc: 'מיקום מקורב', d_layer: 'שכבה', d_danger: 'מישהו בסכנה?', d_near: 'ליד יישוב?',
      yes: 'כן', no: 'לא', unsure: 'לא בטוח', l_nature: 'טבע', l_both: 'טבע + SH✡MER',
      doc: 'תיעוד', no_doc: 'אין תיעוד', demo_photo: 'תמונת הדגמה', trail: 'מעקב', life: 'מצב התיק',
      priv: 'מוצג רק מה שצריך לטיפול: סוג, מיקום מקורב, תיעוד ותוצאה. בלי שמות ובלי מזהים.',
      both_note: 'גם בשכבת SH✡MER: ייתכן שאנשים בסכנה.', tth: 'זמן טיפול', min: 'דק׳', h: 'שע׳',
      t_moved: 'עודכן', t_closed: 'התיק נסגר', t_new: 'דיווח טבע חדש הגיע', saved_local: 'נשמר בדפדפן זה',
      outcome_need: 'בחרו תוצאה לפני סגירה', reporter_sees: 'המדווח/ת רואה: ', r_received: 'התקבל', r_handled: 'טופל',
      rep_title: 'דוח SH✡MER Nature', rep_period: 'תקופה: 30 הימים האחרונים', rep_demo: 'נתוני הדגמה. לא נתונים אמיתיים.',
      col_type: 'סוג', col_area: 'אזור', col_when: 'דווח', col_status: 'מצב', col_outcome: 'תוצאה', col_tth: 'זמן טיפול (דק׳)', col_doc: 'תיעוד', col_layer: 'שכבה',
      ago_now: 'עכשיו', ago_m: 'לפני {n} דק׳', ago_h: 'לפני {n} שע׳',
      org_demo: 'ארגון שטח · הדגמה', org_live: 'רשת SH✡MER · תצוגה חיה', b_pkg: '📦 חבילות', b_acct: '⚙ חשבון', b_exp: '⤓ ייצוא', b_out: 'יציאה', beta: 'גרסת בטא',
      v_person: 'אדם', v_nature: 'טבע', banner: 'נתוני הדגמה · לא נתונים אמיתיים', live_t: 'נתונים חיים', nolive_t: 'אין חיבור לנתונים חיים',
      pr_h: '📦 חבילות · משלמים על מה שמפעילים', pr_sub: 'דשבורד אחד, שתי שכבות. ארגון שצריך את שתיהן מדליק אותן באותו חשבון. אין חיוב כפול.',
      pr_p: 'זמן, מקום כללי, סוג, האם מישהו בדרך, פתוח או הסתיים. בלי שמות ובלי פרטים מזהים.', pr_n: 'סוג המפגע, מיקום בשטח, תיעוד, ומה היה הסוף.', pr_b: 'שתי השכבות באותו חשבון ובאותו דשבורד, במחיר חבילה אחד.',
      pr_wp: 'מועצה עירונית, קב״ט, רכז קהילה', pr_wn: 'גוף טבע, שמורה, רכזי שטח', pr_wb: 'מועצה אזורית, יחידת חילוץ', pr_fit: 'מתאים ל:', pr_price: 'מחיר: לפי גודל וסוג הארגון · TBD', pr_on: 'פעיל בחשבון',
      pr_note: 'התחלה בפיילוט לקהילה, ואחר כך לפי היקף או מספר תושבים. לשינוי החבילה פנו ל-dave@3shamrocks.com. אין תשלום מהמסך הזה.'
    },
    en: {
      title: 'SH✡MER Nature · Field board', tag: 'Protecting those without a voice',
      demo: 'Demo data', live: 'Network data', pv: 'Preview · local',
      k_open: 'Open', k_open_m: 'Reported, waiting to assign', k_enroute: 'En route', k_enroute_m: 'Team or volunteer on the way',
      k_handled: 'Handled', k_handled_m: 'Waiting to close', k_closed: 'Closed · 30 days', k_closed_m: 'With an outcome on file',
      k_tth: 'Median time to handle', k_tth_m: 'From report to handled', k_doc: 'Documented', k_doc_m: 'Photo or note',
      cases: 'Cases', f_type: 'Type', f_area: 'Area', f_status: 'Status', all: 'All', active: 'Active', out_area: 'Outside areas',
      map: 'Field map', map_note: 'Every point is an approximate location (~1 km)', by_type: 'By hazard type', cases_n: 'cases', med: 'median',
      flow: 'Case lifecycle', plan: 'Package', plan_on: 'Active on this account:', p_person: 'Person layer', p_nature: 'Nature layer', p_both: 'Combined package',
      plan_txt: 'Three packages: Person, Nature and Combined. No double charge. Price by the organisation\'s size and type: not set yet.', plan_btn: '📦 Packages',
      export: '⤓ Report', csv: 'CSV', reset: 'Reset demo',
      empty: 'No cases match these filters.', empty_live: 'No nature reports in the area yet. A new report will appear here and on the map.',
      s_open: 'Reported', s_enroute: 'En route', s_handled: 'Handled', s_closed: 'Closed',
      a_enroute: 'Assign · heading out', a_handled: 'Mark handled', a_close: 'Close case', a_reopen: 'Reopen',
      outcome: 'How did it end?', pick: 'Choose an outcome', note: 'Short note (optional)', note_ph: 'What was done in the field?',
      d_when: 'Reported', d_area: 'Area', d_loc: 'Approximate location', d_layer: 'Layer', d_danger: 'Anyone in danger?', d_near: 'Near a settlement?',
      yes: 'Yes', no: 'No', unsure: 'Not sure', l_nature: 'Nature', l_both: 'Nature + SH✡MER',
      doc: 'Documentation', no_doc: 'No documentation', demo_photo: 'Demo photo', trail: 'Trail', life: 'Case status',
      priv: 'Only what the work needs: type, approximate location, documentation and outcome. No names, no identifiers.',
      both_note: 'Also in the SH✡MER layer: people may be at risk.', tth: 'Time to handle', min: 'min', h: 'h',
      t_moved: 'Updated', t_closed: 'Case closed', t_new: 'A new nature report arrived', saved_local: 'Saved in this browser',
      outcome_need: 'Choose an outcome before closing', reporter_sees: 'The reporter sees: ', r_received: 'Received', r_handled: 'Handled',
      rep_title: 'SH✡MER Nature report', rep_period: 'Period: last 30 days', rep_demo: 'Demo data. Not real data.',
      col_type: 'Type', col_area: 'Area', col_when: 'Reported', col_status: 'Status', col_outcome: 'Outcome', col_tth: 'Time to handle (min)', col_doc: 'Documentation', col_layer: 'Layer',
      ago_now: 'now', ago_m: '{n} min ago', ago_h: '{n} h ago',
      org_demo: 'Field organisation · Demo', org_live: 'SH✡MER network · live view', b_pkg: '📦 Packages', b_acct: '⚙ Account', b_exp: '⤓ Export', b_out: 'Sign out', beta: 'Beta',
      v_person: 'Person', v_nature: 'Nature', banner: 'Demo data · not real data', live_t: 'Live data', nolive_t: 'No live data connection',
      pr_h: '📦 Packages · pay for what you turn on', pr_sub: 'One dashboard, two layers. An organisation that needs both turns them on in the same account. No double charge.',
      pr_p: 'Time, general place, type, whether someone is on the way, open or closed. No names, no identifying details.', pr_n: 'Hazard type, field location, documentation, and how it ended.', pr_b: 'Both layers in the same account and dashboard, for one package price.',
      pr_wp: 'City council, security officer, community coordinator', pr_wn: 'Nature body, reserve, field coordinators', pr_wb: 'Regional council, rescue unit', pr_fit: 'Fits:', pr_price: 'Price: by the organisation\'s size and type · TBD', pr_on: 'Active on this account',
      pr_note: 'Starts with a community pilot, then by scope or number of residents. To change the package, write to dave@3shamrocks.com. No payment on this screen.'
    },
    ar: {
      title: 'SH✡MER Nature · لوحة الميدان', tag: 'نحمي من لا صوت له',
      demo: 'بيانات تجريبية', live: 'بيانات الشبكة', pv: 'معاينة · محلي',
      k_open: 'مفتوحة', k_open_m: 'بانتظار التكليف', k_enroute: 'في الطريق', k_enroute_m: 'فريق أو متطوع في الطريق',
      k_handled: 'تمت المعالجة', k_handled_m: 'بانتظار الإغلاق', k_closed: 'أُغلقت · 30 يوماً', k_closed_m: 'مع نتيجة موثقة',
      k_tth: 'الوقت الوسيط للمعالجة', k_tth_m: 'من البلاغ حتى المعالجة', k_doc: 'موثقة', k_doc_m: 'صورة أو ملاحظة',
      cases: 'الملفات', f_type: 'النوع', f_area: 'المنطقة', f_status: 'الحالة', all: 'الكل', active: 'نشطة', out_area: 'خارج المناطق',
      map: 'خريطة الميدان', map_note: 'كل نقطة موقع تقريبي (~1 كم)', by_type: 'حسب نوع الخطر', cases_n: 'ملفات', med: 'الوسيط',
      flow: 'دورة حياة الملف', plan: 'الباقة', plan_on: 'مفعّلة في الحساب:', p_person: 'طبقة الأشخاص', p_nature: 'طبقة الطبيعة', p_both: 'باقة مدمجة',
      plan_txt: 'ثلاث باقات: أشخاص، طبيعة، ومدمجة. لا دفع مزدوج. السعر حسب حجم المؤسسة ونوعها: لم يُحدد بعد.', plan_btn: '📦 الباقات',
      export: '⤓ تقرير', csv: 'CSV', reset: 'إعادة ضبط العرض',
      empty: 'لا توجد ملفات مطابقة.', empty_live: 'لا توجد بلاغات طبيعة في المنطقة بعد. سيظهر البلاغ الجديد هنا وعلى الخريطة.',
      s_open: 'تم الإبلاغ', s_enroute: 'في الطريق', s_handled: 'تمت المعالجة', s_closed: 'مغلق',
      a_enroute: 'تكليف · الخروج للميدان', a_handled: 'تعليم: تمت المعالجة', a_close: 'إغلاق الملف', a_reopen: 'إعادة فتح',
      outcome: 'كيف انتهى؟', pick: 'اختر النتيجة', note: 'ملاحظة قصيرة (اختياري)', note_ph: 'ماذا حدث في الميدان؟',
      d_when: 'وقت البلاغ', d_area: 'المنطقة', d_loc: 'موقع تقريبي', d_layer: 'الطبقة', d_danger: 'هل أحد في خطر؟', d_near: 'قرب بلدة؟',
      yes: 'نعم', no: 'لا', unsure: 'غير متأكد', l_nature: 'طبيعة', l_both: 'طبيعة + SH✡MER',
      doc: 'التوثيق', no_doc: 'لا يوجد توثيق', demo_photo: 'صورة تجريبية', trail: 'السجل', life: 'حالة الملف',
      priv: 'فقط ما يلزم للعمل: النوع، موقع تقريبي، التوثيق والنتيجة. بلا أسماء وبلا معرّفات.',
      both_note: 'أيضاً في طبقة SH✡MER: قد يكون أشخاص في خطر.', tth: 'وقت المعالجة', min: 'د', h: 'س',
      t_moved: 'تم التحديث', t_closed: 'أُغلق الملف', t_new: 'وصل بلاغ طبيعة جديد', saved_local: 'محفوظ في هذا المتصفح',
      outcome_need: 'اختر نتيجة قبل الإغلاق', reporter_sees: 'المُبلّغ يرى: ', r_received: 'تم الاستلام', r_handled: 'تمت المعالجة',
      rep_title: 'تقرير SH✡MER Nature', rep_period: 'الفترة: آخر 30 يوماً', rep_demo: 'بيانات تجريبية. ليست بيانات حقيقية.',
      col_type: 'النوع', col_area: 'المنطقة', col_when: 'وقت البلاغ', col_status: 'الحالة', col_outcome: 'النتيجة', col_tth: 'وقت المعالجة (د)', col_doc: 'التوثيق', col_layer: 'الطبقة',
      ago_now: 'الآن', ago_m: 'قبل {n} د', ago_h: 'قبل {n} س',
      org_demo: 'منظمة ميدانية · عرض تجريبي', org_live: 'شبكة SH✡MER · عرض مباشر', b_pkg: '📦 الباقات', b_acct: '⚙ الحساب', b_exp: '⤓ تصدير', b_out: 'خروج', beta: 'نسخة تجريبية',
      v_person: 'أشخاص', v_nature: 'طبيعة', banner: 'بيانات تجريبية · ليست بيانات حقيقية', live_t: 'بيانات مباشرة', nolive_t: 'لا اتصال ببيانات مباشرة',
      pr_h: '📦 الباقات · تدفع مقابل ما تفعّله', pr_sub: 'لوحة واحدة وطبقتان. المؤسسة التي تحتاج الاثنتين تفعّلهما في الحساب نفسه. لا دفع مزدوج.',
      pr_p: 'الوقت، مكان عام، النوع، هل أحد في الطريق، مفتوح أو منتهٍ. بلا أسماء وبلا تفاصيل معرّفة.', pr_n: 'نوع الخطر، الموقع في الميدان، التوثيق، وكيف انتهى.', pr_b: 'الطبقتان في الحساب واللوحة نفسيهما، بسعر باقة واحد.',
      pr_wp: 'مجلس بلدي، مسؤول أمن، منسّق مجتمع', pr_wn: 'جهة طبيعة، محمية، منسّقو ميدان', pr_wb: 'مجلس إقليمي، وحدة إنقاذ', pr_fit: 'مناسب لـ:', pr_price: 'السعر: حسب حجم المؤسسة ونوعها · TBD', pr_on: 'مفعّلة في الحساب',
      pr_note: 'البداية بتجربة مجتمعية، ثم حسب الحجم أو عدد السكان. لتغيير الباقة راسلوا dave@3shamrocks.com. لا دفع من هذه الشاشة.'
    }
  };
  var TY = {
    dumping:        { ic: '🗑', c: '#8A7A1E', he: 'השלכת אשפה', en: 'Illegal dumping', ar: 'رمي نفايات' },
    reserve_hazard: { ic: '🌿', c: '#2E8B57', he: 'מפגע בשמורה', en: 'Hazard in a reserve', ar: 'خطر في محمية' },
    pollution:      { ic: '💧', c: '#2A8C99', he: 'זיהום', en: 'Pollution', ar: 'تلوّث' },
    animal_injured: { ic: '🐾', c: '#3A9E18', he: 'חיה פצועה', en: 'Injured animal', ar: 'حيوان مصاب' },
    animal_abuse:   { ic: '🐕', c: '#7B5BB6', he: 'התעללות בבעל חיים', en: 'Animal abuse', ar: 'إساءة لحيوان' },
    wildfire:       { ic: '🔥', c: '#E8590C', he: 'שריפת חורש', en: 'Forest fire', ar: 'حريق أحراش' },
    animal:         { ic: '🐾', c: '#3A9E18', he: 'בעל חיים (מ-SOS)', en: 'Animal (from SOS)', ar: 'حيوان (من SOS)' },
    envhaz:         { ic: '🌿', c: '#2E8B57', he: 'מפגע סביבתי (מ-SOS)', en: 'Environmental hazard (from SOS)', ar: 'خطر بيئي (من SOS)' },
    rabies_animal:  { ic: '⚠', c: '#C2185B', he: 'כלבת · חיה מסוכנת', en: 'Rabies · dangerous animal', ar: 'سعار · حيوان خطر' }
  };
  var OC = {
    animal_rescued: { he: 'החיה חולצה ושוחררה', en: 'Animal rescued and released', ar: 'تم إنقاذ الحيوان وإطلاقه' },
    animal_vet:     { he: 'הועברה לטיפול וטרינרי', en: 'Taken for veterinary care', ar: 'نُقل لعلاج بيطري' },
    waste_removed:  { he: 'הפסולת פונתה', en: 'Waste removed', ar: 'أُزيلت النفايات' },
    source_stopped: { he: 'מקור הזיהום נעצר', en: 'Pollution source stopped', ar: 'أُوقف مصدر التلوث' },
    fire_out:       { he: 'האש כובתה', en: 'Fire put out', ar: 'أُطفئ الحريق' },
    enforcement:    { he: 'הועבר לאכיפה', en: 'Passed to enforcement', ar: 'أُحيل إلى جهة إنفاذ' },
    no_finding:     { he: 'לא נמצא בשטח', en: 'Nothing found on site', ar: 'لم يُعثر على شيء في الموقع' },
    duplicate:      { he: 'כפילות', en: 'Duplicate report', ar: 'بلاغ مكرر' }
  };
  function t(k, n) { var s = (W[LANG] && W[LANG][k] != null) ? W[LANG][k] : (W.he[k] != null ? W.he[k] : k); return n == null ? s : s.replace('{n}', n); }
  function ty(k) { var x = TY[k]; return x ? (x[LANG] || x.he) : k; }
  function oc(k) { var x = OC[k]; return x ? (x[LANG] || x.he) : ''; }
  function esc(s) { return (window.ESC || function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); })(s); }
  function ago(ts) { var mn = Math.round((Date.now() - ts) / 60000); if (mn < 1) return t('ago_now'); if (mn < 60) return t('ago_m', mn); if (mn < 48 * 60) return t('ago_h', Math.round(mn / 60)); return (window.ilDate ? ilDate(ts) : new Date(ts).toLocaleDateString()) + ' ' + (window.ilHM ? ilHM(ts) : ''); }
  function hm(ts) { return window.ilHM ? ilHM(ts) : new Date(ts).toTimeString().slice(0, 5); }
  function full(ts) { return window.ilFull ? ilFull(ts) : new Date(ts).toISOString(); }
  function dur(m) { if (m == null) return '—'; return m < 60 ? m + ' ' + t('min') : (Math.round(m / 6) / 10) + ' ' + t('h'); }

  /* ── demo (labelled נתוני הדגמה). Field areas around Modi'in; times relative to now. ── */
  var DEMO_AREAS = [
    { id: 'benshemen', lat: 31.953, lng: 34.935, r: 3.2, he: 'יער בן שמן', en: 'Ben Shemen Forest', ar: 'غابة بن شيمن' },
    { id: 'anaba', lat: 31.905, lng: 35.008, r: 2.2, he: 'פארק ענבה', en: 'Anaba Park', ar: 'منتزه عنابة' },
    { id: 'titora', lat: 31.888, lng: 34.990, r: 1.8, he: 'גבעת הטיטורה', en: 'Titora Hill', ar: 'تلة تيتورا' },
    { id: 'canada', lat: 31.838, lng: 34.990, r: 3.2, he: 'פארק קנדה', en: 'Canada Park', ar: 'منتزه كندا' }
  ];
  var M = 60000, Hr = 36e5;
  /* [type, area, dLat, dLng, minutesAgo, photo, note?, layer, danger, near, steps:[[status, minutesAfterReport, outcome?]]] */
  var DEMO = [
    ['wildfire', 'benshemen', 0.004, -0.006, 12, 1, 'עשן ליד שביל האופניים', 'both', false, true, []],
    ['animal_injured', 'canada', -0.003, 0.004, 26, 1, 'צבי צולע ליד המעיין', 'nature', false, null, [['enroute', 9]]],
    ['dumping', 'anaba', 0.002, 0.003, 48, 1, '', 'nature', false, null, []],
    ['pollution', 'titora', -0.002, -0.002, 95, 0, 'ריח חריף מהערוץ', 'nature', false, null, [['enroute', 20]]],
    ['animal_abuse', 'benshemen', -0.006, 0.008, 140, 0, '', 'nature', false, null, [['enroute', 15], ['handled', 70]]],
    ['reserve_hazard', 'canada', 0.006, -0.004, 5 * 60, 1, 'גדר שבורה ליד בור מים', 'nature', false, null, [['enroute', 35], ['handled', 120]]],
    ['dumping', 'benshemen', 0.009, 0.002, 26 * 60, 1, 'פסולת בניין', 'nature', false, null, [['enroute', 60], ['handled', 180], ['closed', 200, 'waste_removed']]],
    ['animal_injured', 'anaba', -0.004, -0.003, 30 * 60, 1, '', 'nature', false, null, [['enroute', 12], ['handled', 50], ['closed', 65, 'animal_vet']]],
    ['wildfire', 'titora', 0.003, 0.004, 3 * 24 * 60, 0, '', 'both', false, true, [['enroute', 4], ['handled', 38], ['closed', 55, 'fire_out']]],
    ['pollution', 'canada', -0.008, 0.002, 4 * 24 * 60, 1, '', 'nature', false, null, [['enroute', 90], ['handled', 300], ['closed', 330, 'source_stopped']]],
    ['dumping', 'anaba', 0.005, -0.006, 6 * 24 * 60, 0, '', 'nature', false, null, [['closed', 25, 'duplicate']]],
    ['animal_abuse', 'canada', 0.002, 0.009, 9 * 24 * 60, 1, '', 'nature', false, null, [['enroute', 30], ['handled', 75], ['closed', 140, 'enforcement']]],
    ['reserve_hazard', 'benshemen', -0.009, -0.01, 12 * 24 * 60, 0, '', 'nature', false, null, [['enroute', 240], ['handled', 600], ['closed', 610, 'no_finding']]]
  ];
  var _demoBase = null;
  function demoCases() {
    if (!_demoBase) _demoBase = Date.now();
    return DEMO.map(function (d, i) {
      var a = DEMO_AREAS.filter(function (x) { return x.id === d[1]; })[0];
      var ts = _demoBase - d[4] * M, st = null;
      d[10].forEach(function (s) { st = C.step(st, s[0], { ts: ts + s[1] * M, outcome: s[2] }) || st; });
      var p = C.coarse(a.lat + d[2], a.lng + d[3]);
      return { id: 'nd_' + i, type: d[0], ts: ts, lat: p.lat, lng: p.lng, photo: d[5] ? 'demo' : null, note: d[6], layer: d[7], danger: d[8], near: d[9], demo: true, seed: st };
    });
  }
  function areas() { return (CLIENT && CLIENT.demo) ? DEMO_AREAS : ((CLIENT && Array.isArray(CLIENT.areas)) ? CLIENT.areas : []); }
  function areaName(id) { var a = areas().filter(function (x) { return x.id === id; })[0]; return a ? (a[LANG] || a.he || a.id) : t('out_area'); }

  /* ── preview bridge: the app's Nature report reaches this view on the same device, preview only ── */
  function bridgeRows() {
    if (!window.SHOMER_PREVIEW) return [];
    var a = []; try { a = JSON.parse(ls(BRIDGE) || '[]'); } catch (e) { a = []; }
    return (Array.isArray(a) ? a : []).filter(function (r) { return r && r.id && TY[r.type] && typeof r.ts === 'number'; }).map(function (r) {
      var p = C.coarse(+r.lat, +r.lng) || { lat: null, lng: null };
      return { id: String(r.id), type: r.type, ts: r.ts, lat: p.lat, lng: p.lng, photo: (typeof r.photo === 'string' && r.photo.indexOf('data:image/') === 0) ? r.photo : null,
        note: String(r.note || '').slice(0, 140), layer: r.layer === 'both' ? 'both' : 'nature', danger: r.danger, near: r.near, preview: true };
    });
  }
  function bridgeStatus(id, st) {
    if (!window.SHOMER_PREVIEW) return;
    var o = {}; try { o = JSON.parse(ls(BRIDGE_ST) || '{}') || {}; } catch (e) { o = {}; }
    o[id] = { st: C.reporterStatus(st), at: Date.now() }; ls(BRIDGE_ST, JSON.stringify(o));
  }

  /* real rows: the same sanitized feed the Person view reads (nature + both layers only) */
  function liveRows() {
    var L = window._lastLive, out = [], seen = {};
    var src = ((L && !L.opts.demo && L.list) || []).concat(window._revReal || []);
    src.forEach(function (e) {
      if (!e || !TY[e.type]) return;
      var l = window.ShomerRouting ? ShomerRouting.feedLayer(e) : (e.layer || 'shomer'); if (l === 'shomer') return;
      var id = window._evId ? _evId(e) : e.id; if (seen[id]) return; seen[id] = 1;
      var p = C.coarse(+e.lat, +e.lng); if (!p) return;
      out.push({ id: id, type: e.type, ts: e.ts || Date.now(), lat: p.lat, lng: p.lng, photo: null, note: '', layer: l });
    });
    return out;
  }

  function cases() {
    var B = window._boardLoad ? _boardLoad() : { reviews: {} };
    var list = ((CLIENT && CLIENT.demo) ? demoCases() : liveRows()).concat(bridgeRows());
    var A = areas();
    list.forEach(function (c) {
      var rv = B.reviews[c.id];
      c.state = (rv && rv.status) ? rv : (c.seed || null);
      c.area = (c.lat != null) ? C.areaOf(c.lat, c.lng, A) : null;
    });
    return list.sort(function (a, b) {
      var sa = C.statusOf(a.state), sb = C.statusOf(b.state), ra = (sa === 'closed' ? 2 : sa === 'handled' ? 1 : 0), rb = (sb === 'closed' ? 2 : sb === 'handled' ? 1 : 0);
      return (ra - rb) || (b.ts - a.ts);
    });
  }
  function findCase(id) { return cases().filter(function (c) { return c.id === id; })[0] || null; }

  function move(id, to, opts) {
    var c = findCase(id); if (!c) return false;
    var nx = C.step(c.state, to, opts || {}); if (!nx) return false;
    var B = _boardLoad(); B.reviews[id] = nx; _boardSave(B);
    if (c.preview) bridgeStatus(id, to);
    try { if (window.boardRefresh) boardRefresh(); } catch (e) {}
    render(); if (SEL === id) openCase(id);
    toast(to === 'closed' ? t('t_closed') : t('t_moved') + ': ' + t('s_' + to));
    return true;
  }
  NatDash.move = move;
  NatDash.resetDemo = function () {
    var B = _boardLoad(); Object.keys(B.reviews).forEach(function (k) { if (/^nd_/.test(k)) delete B.reviews[k]; }); _boardSave(B); _demoBase = null; render();
  };

  function toast(msg) {
    var o = document.getElementById('nd-toast'); if (o) o.remove();
    var d = document.createElement('div'); d.id = 'nd-toast'; d.className = 'nd-toast'; d.setAttribute('role', 'status'); d.textContent = msg;
    document.body.appendChild(d); setTimeout(function () { try { d.remove(); } catch (e) {} }, 2600);
  }

  /* ── view switching (Person | Nature) in the same account ── */
  function ent() { return (window.CLIENT && CLIENT.layers) || ['shomer']; }
  NatDash.view = function () { return VIEW; };
  NatDash.isOn = function () { return VIEW === 'nature'; };
  NatDash.pickInitial = function () {
    var e = ent(), q = ''; try { q = new URLSearchParams(location.search).get('view') || ''; } catch (_) {}
    var saved = ls('shomer_dash_view');
    var want = q === 'nature' || q === 'person' ? q : (saved === 'nature' || saved === 'person' ? saved : (e.indexOf('shomer') < 0 ? 'nature' : 'person'));
    if (want === 'nature' && e.indexOf('nature') < 0) want = 'person';
    if (want === 'person' && e.indexOf('shomer') < 0) want = 'nature';
    setView(want, true);
  };
  function setView(v, quiet) {
    var e = ent();
    if (v === 'nature' && e.indexOf('nature') < 0) { try { openPricing(); } catch (_) {} return; }
    if (v === 'person' && e.indexOf('shomer') < 0) { try { openPricing(); } catch (_) {} return; }
    VIEW = v; if (!quiet) ls('shomer_dash_view', v);
    document.body.classList.toggle('nat-view', v === 'nature');
    document.body.classList.toggle('nat-skin', v === 'nature');
    var lg = document.querySelector('.topbar .logo-img');
    if (lg) { lg.src = v === 'nature' ? 'nature-assets/nature-logo-white.png' : 'SHOMER_logo_big.png'; lg.alt = v === 'nature' ? 'SH✡MER Nature' : 'SH✡MER'; }
    var sm = document.querySelector('.topbar .brand small'); if (sm) sm.textContent = v === 'nature' ? 'Nature · Field' : 'Command · Municipal Intelligence';
    try { if (window.lyrInit) lyrInit(); } catch (_) {}
    wrapPricing(); chrome(v === 'nature');
    if (v === 'person') { try { if (window._curCity && !(CLIENT && CLIENT.demo) && window.drawTerritory) drawTerritory(_curCity); } catch (_) {} }
    if (v === 'nature') { render(); setTimeout(function () { try { NMAP && NMAP.invalidateSize(); fitMap(); } catch (_) {} }, 60); }
    else { try { if (window.MAP) setTimeout(function () { MAP.invalidateSize(); }, 60); if (window.boardRefresh) boardRefresh(); } catch (_) {} }
  }
  NatDash.setView = setView;
  NatDash.locale = function () { return LANG === 'en' ? 'en-GB' : LANG === 'ar' ? 'ar-EG' : 'he-IL'; };
  function orgLabel() { if (CLIENT && CLIENT.demo) return t('org_demo'); if (CLIENT && CLIENT.live) return t('org_live'); return (CLIENT && CLIENT.org) || ''; }
  NatDash.orgLabel = orgLabel;

  /* the top bar and the demo banner follow the Nature view's language; the Person view gets its own words back */
  var CHROME = [['pricing-btn', 'b_pkg'], ['acct-btn', 'b_acct'], ['export-btn', 'b_exp'], ['signout', 'b_out'], ['plan-badge', 'beta'], ['org-name', null], ['demo-banner', 'banner']];
  var _orig = null;
  function chrome(on) {
    if (!_orig) _orig = {};
    CHROME.forEach(function (c) {
      var el = document.getElementById(c[0]); if (!el) return;
      if (_orig[c[0]] === undefined) _orig[c[0]] = el.textContent;   /* first time we touch it = its own words */
      if (on) el.textContent = c[1] ? t(c[1]) : orgLabel();
      else if (c[0] === 'org-name') el.textContent = (CLIENT && CLIENT.org) || '';
      else el.textContent = _orig[c[0]];
    });
    var tb = document.querySelector('#app .topbar'); if (tb) { if (on) { tb.setAttribute('dir', LANG === 'en' ? 'ltr' : 'rtl'); tb.setAttribute('lang', LANG); } else { tb.removeAttribute('dir'); tb.removeAttribute('lang'); } }
    var li = document.getElementById('live-ind'); if (li && on) li.title = li.classList.contains('off') ? t('nolive_t') : t('live_t');
    var vp = document.querySelector('#lyr .lyr-b[data-v="person"]'), vn = document.querySelector('#lyr .lyr-b[data-v="nature"]');
    if (vp) vp.textContent = '👤 ' + (on ? t('v_person') : 'אדם'); if (vn) vn.textContent = '🌿 ' + (on ? t('v_nature') : 'טבע');
    var g = document.getElementById('lyr'); if (g) g.setAttribute('aria-label', on ? t('d_layer') : 'שכבות');
    try { document.title = on ? t('title') : 'SH✡MER Command · Municipal Intelligence'; } catch (_) {}
    try { if (window.clkTick) clkTick(); } catch (_) {}
    syncBanner();
  }
  NatDash.chrome = chrome;
  /* the fixed demo banner reserves its own height, so it never covers the top bar (phones wrap it) */
  function syncBanner() { var b = document.getElementById('demo-banner'); if (!b) return; try { document.documentElement.style.setProperty('--demo-h', b.offsetHeight + 'px'); } catch (_) {}
    if (!b._ro && window.ResizeObserver) { b._ro = new ResizeObserver(function () { try { document.documentElement.style.setProperty('--demo-h', b.offsetHeight + 'px'); } catch (_) {} }); b._ro.observe(b); } }
  NatDash.syncBanner = syncBanner;
  function natPricing() {
    if (document.getElementById('pricing-ov')) return;
    var e = ent(), cur = e.length > 1 ? 'both' : e[0];
    function tier(k, h, who, desc) { return '<div class="pr-t"' + (k === cur ? ' style="border-color:var(--gold)"' : '') + '><h4>' + esc(h) + (k === cur ? ' · <span style="color:var(--gold);font-size:11px">' + esc(t('pr_on')) + '</span>' : '') + '</h4><p>' + esc(desc) + '</p><p><b>' + esc(t('pr_fit')) + '</b> ' + esc(who) + '</p><div class="pr-p">' + esc(t('pr_price')) + '</div><span class="pr-eyes">NEEDS YOUR EYES</span></div>'; }
    var ov = document.createElement('div'); ov.id = 'pricing-ov'; ov.className = 'acct-ov'; ov.setAttribute('dir', LANG === 'en' ? 'ltr' : 'rtl'); ov.setAttribute('lang', LANG);
    ov.innerHTML = '<div class="acct-card" style="max-width:720px"><div class="acct-head"><h3>' + esc(t('pr_h')) + '</h3><button class="acct-x" aria-label="✕">✕</button></div>'
      + '<div class="acct-sub">' + esc(t('pr_sub')) + '</div><div class="pr-grid">'
      + tier('shomer', '👤 ' + t('p_person'), t('pr_wp'), t('pr_p')) + tier('nature', '🌿 ' + t('p_nature'), t('pr_wn'), t('pr_n')) + tier('both', '👤🌿 ' + t('p_both'), t('pr_wb'), t('pr_b'))
      + '</div><div class="acct-note">' + esc(t('pr_note')) + '</div></div>';
    ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.remove(); });
    ov.querySelector('.acct-x').onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
  }
  function wrapPricing() { if (!window.openPricing || window.openPricing._nat) return; var orig = window.openPricing;
    window.openPricing = function () { if (VIEW === 'nature' && LANG !== 'he') return natPricing(); return orig.apply(this, arguments); }; window.openPricing._nat = true; }
  NatDash.onLive = function () { if (VIEW === 'nature') render(); };

  /* ── render ── */
  function shell() {
    var host = document.getElementById('nat-view'); if (!host) return null;
    if (host.getAttribute('data-lang') === LANG && host.firstChild) return host;
    if (NMAP) { try { NMAP.remove(); } catch (_) {} NMAP = null; NLAYER = null; }
    host.setAttribute('data-lang', LANG);
    host.setAttribute('dir', LANG === 'en' ? 'ltr' : 'rtl'); host.setAttribute('lang', LANG);
    host.innerHTML = '<div class="nd-wrap">'
      + '<div class="nd-head"><div class="nd-title"><b>' + esc(t('title')) + '</b><span>' + esc(t('tag')) + '</span></div>'
      + '<span id="nd-src"></span><span class="nd-sp"></span>'
      + '<span class="nd-langs" role="group" aria-label="Language">' + [['he', 'עב'], ['ar', 'عر'], ['en', 'EN']].map(function (p) { return '<button type="button" data-l="' + p[0] + '" aria-pressed="' + (p[0] === LANG) + '">' + p[1] + '</button>'; }).join('') + '</span>'
      + '<button type="button" class="nd-btn" id="nd-reset" hidden>' + esc(t('reset')) + '</button>'
      + '<button type="button" class="nd-btn" id="nd-csv">' + esc(t('csv')) + '</button>'
      + '<button type="button" class="nd-btn pri" id="nd-export">' + esc(t('export')) + '</button></div>'
      + '<div class="nd-kpis" id="nd-kpis"></div>'
      + '<div class="nd-main"><section class="nd-card cases" aria-label="' + esc(t('cases')) + '"><div class="nd-ch"><b>' + esc(t('cases')) + '</b><span class="nd-n" id="nd-count"></span></div>'
      + '<div class="nd-filters" id="nd-filters"></div><div class="nd-list" id="nd-list"></div></section>'
      + '<section class="nd-card" aria-label="' + esc(t('map')) + '"><div class="nd-ch"><b>' + esc(t('map')) + '</b><span class="nd-mapnote">' + esc(t('map_note')) + '</span></div><div id="nat-map"></div><div class="nd-legend" id="nd-legend"></div></section></div>'
      + '<div class="nd-low"><section class="nd-card"><div class="nd-ch"><b>' + esc(t('by_type')) + '</b></div><div class="nd-bars" id="nd-bars"></div></section>'
      + '<section class="nd-card"><div class="nd-ch"><b>' + esc(t('flow')) + '</b></div><div class="nd-flow" id="nd-flow"></div></section>'
      + '<section class="nd-card"><div class="nd-ch"><b>' + esc(t('plan')) + '</b></div><div class="nd-plan" id="nd-plan"></div></section></div>'
      + '</div>';
    host.querySelectorAll('.nd-langs button').forEach(function (b) { b.onclick = function () { LANG = b.getAttribute('data-l'); ls('shomer_nat_lang', LANG); render(); chrome(true); if (SEL) openCase(SEL); }; });
    host.querySelector('#nd-export').onclick = function () { NatDash.exportReport(); };
    host.querySelector('#nd-csv').onclick = function () { NatDash.exportCSV(); };
    host.querySelector('#nd-reset').onclick = function () { NatDash.resetDemo(); };
    return host;
  }

  function render() {
    if (VIEW !== 'nature') return;
    var host = shell(); if (!host) return;
    var all = cases(), demo = !!(CLIENT && CLIENT.demo), m = C.metrics(all, { days: 30 });
    var src = host.querySelector('#nd-src');
    src.innerHTML = (demo ? '<span class="nd-pill demo">' + esc(t('demo')) + '</span>' : '<span class="nd-pill live">' + esc(t('live')) + '</span>')
      + (window.SHOMER_PREVIEW ? ' <span class="nd-pill pv">' + esc(t('pv')) + '</span>' : '');
    host.querySelector('#nd-reset').hidden = !demo;
    function kpi(cls, k, v, sub) { return '<div class="nd-kpi ' + cls + '"><div class="kl">' + esc(t(k)) + '</div><div class="kv">' + v + '</div><div class="km">' + esc(t(k + '_m')) + (sub || '') + '</div></div>'; }
    var tth = m.medianHandleMin == null ? '—' : (m.medianHandleMin < 60 ? m.medianHandleMin + '<small>' + esc(t('min')) + '</small>' : (Math.round(m.medianHandleMin / 6) / 10) + '<small>' + esc(t('h')) + '</small>');
    host.querySelector('#nd-kpis').innerHTML = kpi('acc' + (m.open ? ' warn' : ''), 'k_open', m.open) + kpi('', 'k_enroute', m.enroute) + kpi('', 'k_handled', m.handled)
      + kpi('acc', 'k_closed', m.closedInPeriod) + kpi('', 'k_tth', tth) + kpi('', 'k_doc', m.documentedPct == null ? '—' : m.documentedPct + '<small>%</small>');
    /* filters */
    var types = C.TYPES.slice(); all.forEach(function (c) { if (types.indexOf(c.type) < 0) types.push(c.type); });
    var A = areas();
    function sel(id, label, opts, cur) { return '<label>' + esc(t(label)) + '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; }
    var fh = host.querySelector('#nd-filters');
    fh.innerHTML = sel('nd-f-type', 'f_type', [['all', t('all')]].concat(types.map(function (k) { return [k, ty(k)]; })), F.type)
      + sel('nd-f-area', 'f_area', [['all', t('all')]].concat(A.map(function (a) { return [a.id, a[LANG] || a.he]; })), F.area)
      + sel('nd-f-status', 'f_status', [['active', t('active')], ['all', t('all')], ['open', t('s_open')], ['enroute', t('s_enroute')], ['handled', t('s_handled')], ['closed', t('s_closed')]], F.status);
    fh.querySelectorAll('select').forEach(function (s) { s.onchange = function () { F[s.id.replace('nd-f-', '')] = s.value; render(); }; });
    var shown = C.filter(all, F);
    host.querySelector('#nd-count').textContent = shown.length + ' / ' + all.length;
    var lh = host.querySelector('#nd-list');
    lh.innerHTML = shown.length ? shown.map(itemHTML).join('') : '<div class="nd-empty">' + esc(all.length ? t('empty') : t('empty_live')) + '</div>';
    lh.querySelectorAll('.nd-item').forEach(function (b) { b.onclick = function () { openCase(b.getAttribute('data-id')); }; });
    drawMap(shown);
    /* by type */
    var max = 1; types.forEach(function (k) { max = Math.max(max, m.byType[k] || 0); });
    host.querySelector('#nd-bars').innerHTML = types.filter(function (k) { return C.TYPES.indexOf(k) >= 0 || m.byType[k]; }).map(function (k) {
      var n = m.byType[k] || 0, mins = []; all.forEach(function (c) { if (c.type === k) { var h = C.handleMinutes(c.ts, c.state); if (h != null) mins.push(h); } });
      return '<div class="nd-bar"><span>' + (TY[k] ? TY[k].ic + ' ' : '') + esc(ty(k)) + '</span><span class="tr"><i style="width:' + (n / max * 100).toFixed(0) + '%;background:' + (TY[k] ? TY[k].c : '#3A9E18') + '"></i></span><b>' + n + '</b><em>' + esc(t('med')) + ' ' + esc(dur(C.median(mins))) + '</em></div>';
    }).join('');
    host.querySelector('#nd-flow').innerHTML = ['open', 'enroute', 'handled', 'closed'].map(function (s) { return '<div><b>' + m[s] + '</b><span>' + esc(t('s_' + s)) + '</span></div>'; }).join('');
    var e = ent(), cur = e.length > 1 ? 'p_both' : (e[0] === 'nature' ? 'p_nature' : 'p_person');
    host.querySelector('#nd-plan').innerHTML = '<div>' + esc(t('plan_on')) + ' <b>' + esc(t(cur)) + '</b></div><div>' + esc(t('plan_txt')) + '</div>'
      + '<div><button type="button" class="nd-btn" id="nd-plan-btn">' + esc(t('plan_btn')) + '</button> <span class="nd-tag">NEEDS YOUR EYES</span></div>';
    host.querySelector('#nd-plan-btn').onclick = function () { try { openPricing(); } catch (_) {} };
    /* new preview reports: one gentle notice */
    all.forEach(function (c) { if (c.preview && !_seenBridge[c.id]) { _seenBridge[c.id] = 1; if (_bridgeReady && C.statusOf(c.state) === 'open') toast(t('t_new') + ': ' + ty(c.type)); } });
    _bridgeReady = true;
    chrome(true);
  }
  var _bridgeReady = false;

  function itemHTML(c) {
    var st = C.statusOf(c.state), T = TY[c.type] || { ic: '•', c: '#3A9E18' };
    var docs = (c.photo ? '📷' : '') + (c.note ? '📝' : '');
    return '<button type="button" class="nd-item' + (SEL === c.id ? ' sel' : '') + '" data-id="' + esc(c.id) + '">'
      + '<span class="nd-ic" style="border-color:' + T.c + '55">' + T.ic + '</span>'
      + '<span class="nd-tx"><span class="nd-tt">' + esc(ty(c.type))
      + (c.layer === 'both' ? '<span class="nd-tag">' + esc(t('l_both')) + '</span>' : '')
      + (c.demo ? '<span class="nd-tag demo">' + esc(t('demo')) + '</span>' : '')
      + (c.preview && st === 'open' ? '<span class="nd-tag new">' + esc(t('pv')) + '</span>' : '') + '</span>'
      + '<span class="nd-mt" style="display:block">' + esc(areaName(c.area)) + ' · ' + esc(ago(c.ts)) + (docs ? ' · <span class="nd-doc">' + docs + '</span>' : '') + '</span>'
      + (st === 'closed' && c.state && c.state.outcome ? '<span class="nd-oc" style="display:block">✓ ' + esc(oc(c.state.outcome)) + '</span>' : '') + '</span>'
      + '<span class="nd-st ' + st + '">' + esc(t('s_' + st)) + '</span></button>';
  }

  function drawMap(list) {
    var el = document.getElementById('nat-map'); if (!el || !window.L) return;
    if (!NMAP) {
      NMAP = L.map(el, { zoomControl: true, attributionControl: true, zoomSnap: 0.5 }).setView([31.9, 34.97], 11);
      try { NMAP.attributionControl.setPrefix(false); } catch (_) {}
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 17, attribution: 'Esri · OSM' }).addTo(NMAP);
      NLAYER = L.layerGroup().addTo(NMAP); NMAP._fitted = false;
    }
    NLAYER.clearLayers();
    areas().forEach(function (a) { L.circle([a.lat, a.lng], { radius: (a.r || 3) * 1000, color: '#3A9E18', weight: 1, dashArray: '4 5', fillOpacity: .04, interactive: false }).addTo(NLAYER); });
    var pts = [];
    list.forEach(function (c) {
      if (c.lat == null) return; var st = C.statusOf(c.state), T = TY[c.type] || { ic: '•', c: '#3A9E18' };
      L.circle([c.lat, c.lng], { radius: 550, color: T.c, weight: 1, fillColor: T.c, fillOpacity: st === 'closed' ? .05 : .12, interactive: false }).addTo(NLAYER);
      var mk = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'nd-pin ' + st + (c.preview && st === 'open' ? ' new' : ''), html: '<b style="background:' + T.c + '">' + T.ic + '</b>', iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: true, title: ty(c.type) });
      mk.bindTooltip(esc(ty(c.type)) + ' · ' + esc(t('s_' + st)) + '<br>' + esc(areaName(c.area)) + ' · ' + esc(ago(c.ts)), { direction: 'top', offset: [0, -14] });
      mk.on('click', function () { openCase(c.id); }); mk.addTo(NLAYER); pts.push([c.lat, c.lng]);
    });
    var lg = document.getElementById('nd-legend');
    if (lg) lg.innerHTML = C.TYPES.map(function (k) { return '<span><i style="background:' + TY[k].c + '"></i>' + esc(ty(k)) + '</span>'; }).join('');
    NMAP._pts = pts; if (!NMAP._fitted) fitMap();
  }
  function fitMap() {
    if (!NMAP) return; var pts = (NMAP._pts || []).concat(areas().map(function (a) { return [a.lat, a.lng]; }));
    if (pts.length) { try { NMAP.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 13 }); NMAP._fitted = true; } catch (_) {} }
  }

  /* ── one case ── */
  function openCase(id) {
    var c = findCase(id); if (!c) return; SEL = id;
    var st = C.statusOf(c.state), T = TY[c.type] || { ic: '•' };
    var old = document.getElementById('nd-ov'); if (old) old.remove();
    var ov = document.createElement('div'); ov.id = 'nd-ov'; ov.className = 'nd-ov'; ov.setAttribute('dir', LANG === 'en' ? 'ltr' : 'rtl');
    var log = (c.state && c.state.log) || [];
    function firstTs(s) { for (var i = 0; i < log.length; i++) if (log[i].st === s) return log[i].ts; return null; }
    var steps = ['open', 'enroute', 'handled', 'closed'], rk = steps.indexOf(st);
    var stepsHTML = steps.map(function (s, i) { var ts = i === 0 ? c.ts : firstTs(s); return '<div class="' + (i <= rk ? 'done' : '') + (i === rk ? ' cur' : '') + '">' + esc(t('s_' + s)) + (ts && i <= rk ? '<time>' + esc(hm(ts)) + '</time>' : '') + '</div>'; }).join('');
    var yn = function (v) { return v === true ? t('yes') : v === false ? t('no') : t('unsure'); };
    var docHTML = c.photo === 'demo' ? '<div class="nd-ph-demo">📷 ' + esc(t('demo_photo')) + '</div>'
      : (c.photo ? '<img class="nd-photo" alt="' + esc(t('doc')) + '" src="' + esc(c.photo) + '">' : '');
    docHTML += c.note ? '<div style="margin-top:8px;font-size:13.5px">📝 ' + esc(c.note) + '</div>' : '';
    if (!docHTML) docHTML = '<div class="nd-note">' + esc(t('no_doc')) + '</div>';
    var acts = '';
    if (st === 'open') acts += '<button type="button" class="nd-btn pri" data-go="enroute">' + esc(t('a_enroute')) + '</button>';
    if (st === 'open' || st === 'enroute') acts += '<button type="button" class="nd-btn" data-go="handled">' + esc(t('a_handled')) + '</button>';
    var closeHTML = st === 'closed'
      ? '<div class="nd-oc" style="font-size:14px">✓ ' + esc(oc(c.state.outcome)) + '</div>' + (c.state.note ? '<div style="font-size:13px;margin-top:4px">' + esc(c.state.note) + '</div>' : '') + '<div class="nd-acts" style="margin-top:10px"><button type="button" class="nd-btn" data-go="open">' + esc(t('a_reopen')) + '</button></div>'
      : '<div class="nd-close"><label for="nd-oc">' + esc(t('outcome')) + '</label><select id="nd-oc"><option value="">' + esc(t('pick')) + '</option>' + C.OUTCOMES.map(function (k) { return '<option value="' + k + '">' + esc(oc(k)) + '</option>'; }).join('') + '</select>'
        + '<label for="nd-note">' + esc(t('note')) + '</label><textarea id="nd-note" maxlength="300" placeholder="' + esc(t('note_ph')) + '"></textarea>'
        + '<div class="nd-acts" style="margin-top:10px"><button type="button" class="nd-btn go" id="nd-close-go">' + esc(t('a_close')) + '</button></div></div>';
    ov.innerHTML = '<div class="nd-dr" role="dialog" aria-modal="true" aria-label="' + esc(ty(c.type)) + '">'
      + '<div class="nd-dh"><span style="font-size:22px">' + T.ic + '</span><b>' + esc(ty(c.type)) + '</b><span class="nd-st ' + st + '">' + esc(t('s_' + st)) + '</span><button type="button" class="nd-x" aria-label="✕">✕</button></div>'
      + '<div class="nd-db">'
      + (c.demo ? '<div><span class="nd-pill demo">' + esc(t('demo')) + '</span></div>' : '')
      + (c.layer === 'both' ? '<div class="nd-sec" style="border-color:#F2B27A;background:#FFF6EE;font-size:13px">⚠ ' + esc(t('both_note')) + '</div>' : '')
      + '<div class="nd-sec"><h4>' + esc(t('life')) + '</h4><div class="nd-steps">' + stepsHTML + '</div><div class="nd-acts">' + acts + '</div></div>'
      + '<div class="nd-sec"><div class="nd-kv"><span>' + esc(t('d_when')) + '</span><b dir="ltr" style="text-align:start">' + esc(full(c.ts)) + '</b>'
      + '<span>' + esc(t('d_area')) + '</span><b>' + esc(areaName(c.area)) + '</b>'
      + '<span>' + esc(t('d_loc')) + '</span><b dir="ltr" style="text-align:start">' + (c.lat != null ? c.lat.toFixed(2) + ', ' + c.lng.toFixed(2) + ' (~1 km)' : '—') + '</b>'
      + '<span>' + esc(t('d_layer')) + '</span><b>' + esc(c.layer === 'both' ? t('l_both') : t('l_nature')) + '</b>'
      + (c.danger != null ? '<span>' + esc(t('d_danger')) + '</span><b>' + esc(yn(c.danger)) + '</b>' : '')
      + (c.type === 'wildfire' && c.near !== undefined ? '<span>' + esc(t('d_near')) + '</span><b>' + esc(yn(c.near)) + '</b>' : '')
      + '<span>' + esc(t('tth')) + '</span><b>' + esc(dur(C.handleMinutes(c.ts, c.state))) + '</b>'
      + (c.preview ? '<span>' + esc(t('reporter_sees')) + '</span><b>' + esc(C.reporterStatus(st) === 'handled' ? t('r_handled') : t('r_received')) + '</b>' : '')
      + '</div></div>'
      + '<div class="nd-sec"><h4>' + esc(t('doc')) + '</h4>' + docHTML + '</div>'
      + '<div class="nd-sec"><h4>' + esc(t('outcome')) + '</h4>' + closeHTML + '</div>'
      + (log.length ? '<div class="nd-sec"><h4>' + esc(t('trail')) + '</h4><div class="nd-trail">' + log.map(function (x) { return '<div><b>' + esc(full(x.ts)) + '</b> · ' + esc(t('s_' + x.st)) + (x.outcome ? ' · ' + esc(oc(x.outcome)) : '') + (x.note ? ' · ' + esc(x.note) : '') + '</div>'; }).join('') + '</div><div class="nd-note" style="margin-top:6px">' + esc(t('saved_local')) + '</div></div>' : '')
      + '<div class="nd-priv">' + esc(t('priv')) + '</div>'
      + '</div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); SEL = null; render(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.nd-x').onclick = close;
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    ov.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { move(id, b.getAttribute('data-go')); }; });
    var cg = ov.querySelector('#nd-close-go');
    if (cg) cg.onclick = function () {
      var o = ov.querySelector('#nd-oc').value, n = ov.querySelector('#nd-note').value;
      if (!o) { toast(t('outcome_need')); ov.querySelector('#nd-oc').focus(); return; }
      move(id, 'closed', { outcome: o, note: n });
    };
    try { ov.querySelector('.nd-x').focus(); } catch (_) {}
    var lh = document.querySelectorAll('#nd-list .nd-item'); lh.forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-id') === id); });
  }
  NatDash.openCase = openCase;

  /* ── export: printable report + CSV (no names, ~1 km locations, demo marked) ── */
  function rowsFor() {
    return C.filter(cases(), F).map(function (c) {
      var st = C.statusOf(c.state);
      return [ty(c.type), areaName(c.area), full(c.ts), t('s_' + st), st === 'closed' ? oc(c.state.outcome) : '', C.handleMinutes(c.ts, c.state) == null ? '' : C.handleMinutes(c.ts, c.state),
        (c.photo ? '📷' : '') + (c.note ? '📝' : ''), c.layer === 'both' ? t('l_both') : t('l_nature')];
    });
  }
  function head() { return [t('col_type'), t('col_area'), t('col_when'), t('col_status'), t('col_outcome'), t('col_tth'), t('col_doc'), t('col_layer')]; }
  NatDash.exportCSV = function () {
    var demo = !!(CLIENT && CLIENT.demo);
    var csv = '﻿' + (demo ? C.csvCell(t('rep_demo')) + '\r\n' : '') + C.toCSV(head(), rowsFor());
    try {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'shomer-nature-' + (window._ilDay ? _ilDay(Date.now()) : 'report') + (demo ? '-demo' : '') + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
    } catch (e) {}
  };
  NatDash.reportHTML = function () {
    var all = cases(), m = C.metrics(all, { days: 30 }), demo = !!(CLIENT && CLIENT.demo), rows = rowsFor();
    var dir = LANG === 'en' ? 'ltr' : 'rtl';
    var css = 'body{font-family:Heebo,Alef,Arial,sans-serif;color:#12200F;margin:28px;direction:' + dir + '}h1{font-size:22px;margin:0}h1 span{color:#3A9E18}.sub{color:#46543F;margin:4px 0 16px}'
      + '.demo{display:inline-block;background:#B3202D;color:#fff;font-weight:800;padding:4px 12px;border-radius:8px;margin-bottom:12px}'
      + '.k{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 18px}.k div{border:1px solid #D3DECE;border-radius:10px;padding:8px 12px;min-width:120px}.k b{display:block;font-size:22px}'
      + 'table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #DCE6D8;padding:6px 5px;text-align:start}th{background:#EEF3EB}.f{margin-top:16px;font-size:11px;color:#6E7C68}';
    return '<!DOCTYPE html><html lang="' + LANG + '" dir="' + dir + '"><head><meta charset="utf-8"><title>' + esc(t('rep_title')) + '</title><style>' + css + '</style></head><body>'
      + (demo ? '<div class="demo">' + esc(t('rep_demo')) + '</div>' : '')
      + '<h1>' + esc(t('rep_title')) + '</h1>'
      + '<div class="sub">' + esc(orgLabel()) + ' · ' + esc(t('rep_period')) + ' · ' + esc(full(Date.now())) + '</div>'
      + '<div class="k"><div>' + esc(t('k_open')) + '<b>' + m.open + '</b></div><div>' + esc(t('k_enroute')) + '<b>' + m.enroute + '</b></div><div>' + esc(t('k_handled')) + '<b>' + m.handled + '</b></div><div>' + esc(t('k_closed')) + '<b>' + m.closedInPeriod + '</b></div><div>' + esc(t('k_tth')) + '<b>' + esc(dur(m.medianHandleMin)) + '</b></div><div>' + esc(t('k_doc')) + '<b>' + (m.documentedPct == null ? '—' : m.documentedPct + '%') + '</b></div></div>'
      + '<table><thead><tr>' + head().map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'
      + '<div class="f">' + esc(t('priv')) + '</div></body></html>';
  };
  NatDash.exportReport = function () {
    var w = window.open('', '_blank'); if (!w) { toast('Popup blocked'); return; }
    w.document.open(); w.document.write(NatDash.reportHTML()); w.document.close();
  };

  /* language: ?nlang= or the last choice */
  try { var q = new URLSearchParams(location.search).get('nlang'); LANG = (q === 'en' || q === 'ar' || q === 'he') ? q : ((ls('shomer_nat_lang') === 'en' || ls('shomer_nat_lang') === 'ar') ? ls('shomer_nat_lang') : 'he'); } catch (_) {}
  /* the gate takes the Nature look when the page is opened for the Nature view */
  try { if (new URLSearchParams(location.search).get('view') === 'nature') { document.documentElement.classList.add('nat-entry'); document.addEventListener('DOMContentLoaded', function () { document.body.classList.add('nat-skin'); var g = document.getElementById('gate-tag'); if (g) g.textContent = 'SH✡MER Nature · שומרים על מי שאין לו קול'; }); } } catch (_) {}
  /* if the account was already set up before this file ran, pick the view now */
  try { if (window.CLIENT && typeof window.lyrInit === 'function') lyrInit(); } catch (_) {}
  /* preview: a report sent from the app on this device shows up here at once */
  window.addEventListener('storage', function (e) { if (e.key === BRIDGE && VIEW === 'nature') render(); });
  setInterval(function () { if (VIEW === 'nature' && !document.getElementById('nd-ov')) { try { render(); } catch (_) {} } }, 30000);
})();
