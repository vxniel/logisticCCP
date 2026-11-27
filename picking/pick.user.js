// ==UserScript==
// @name         Picking asistido Dimerc CCP
// @namespace    dimerc-ccp
// @version      2.2
// @description  Usa la rotacion de la app: abre tu zona primero (PB/FV/F), luego las otras; pone la ubicacion y el producto se escanea a mano
// @match        http://10.10.180.248/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
/* Picking asistido Dimerc CCP — ES5 (Chrome antiguo de la Zebra).
   Se ejecuta DENTRO de la página de preparación. Pone sola la UBICACIÓN del siguiente producto (de arriba hacia abajo,
   solo de la zona elegida: PB / FV / F) y deja el cursor en "Producto" para que solo escanees el producto. */
(function () {
  if (window.__pkAuto) { try { window.__pkAuto.mostrar(); } catch (e) {} return; }
  var K = 'dimerc_pk_cfg';
  function cfgGet() { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } }
  function cfgSet(c) { try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) {} }
  var cfg = cfgGet(); if (!cfg.zona) cfg.zona = '*'; if (!cfg.modo) cfg.modo = 'auto'; if (cfg.auto === undefined) cfg.auto = true; if (!cfg.orden) cfg.orden = 'lista'; if (cfg.voz === undefined) cfg.voz = true; if (cfg.tono === undefined) cfg.tono = true; if (!cfg.estr) cfg.estr = { PB: '22-29', FV: '1-8', F: '11-14' };
  var hechos = {}, idx = 0, ultCod = '', ultFill = 0, vioMsg = false, items = [], uInp = null, pInp = null;

  function vis(el) { return !!(el && el.offsetWidth && el.offsetHeight); }
  function txt(el) { return (el.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }
  function buscarInputs() {
    var ins = document.getElementsByTagName('input'), u = null, p = null, i, a, v;
    for (i = 0; i < ins.length; i++) {
      var t = ins[i]; if (t.type === 'hidden' || t.type === 'button' || t.type === 'submit' || t.type === 'checkbox' || t.type === 'radio') continue;
      a = ((t.placeholder || '') + ' ' + (t.id || '') + ' ' + (t.name || '')).toLowerCase();
      if (!u && /ubic/.test(a) && vis(t)) u = t; else if (!p && /prod|sku|cod|barra/.test(a) && !/cant|digit/.test(a) && vis(t)) p = t;
    }
    return { u: u, p: p };
  }
  var RE_UBI = /^[A-Za-z]{1,3}(-[0-9A-Za-z]{1,3}){3,8}$/;
  function leerFilas() {
    var rows = document.getElementsByTagName('tr'), out = [], seen = {}, i, j;
    for (i = 0; i < rows.length; i++) {
      var tds = rows[i].children, ub = '', cod = '', des = '';
      if (!tds || tds.length < 2 || rows[i].getElementsByTagName('table').length) continue;
      for (j = 0; j < tds.length; j++) {
        var s = txt(tds[j]), sc = s.replace(/\s+/g, '');
        if (!ub && RE_UBI.test(sc)) ub = sc; else if (!cod && /^[A-Za-z]?[0-9]{5,8}$/.test(sc)) cod = sc; else if (s.length > 6 && !des) des = s;
      }
      if (ub && cod && !seen[cod + ub]) { seen[cod + ub] = 1; out.push({ cod: cod, ub: ub, des: des }); }
    }
    return out;
  }
  function filtrar(l) {
    var z = cfg.modo === 'auto' ? '*' : cfg.zona, r = [], i;
    for (i = 0; i < l.length; i++) { if (z === '*' || l[i].ub.toUpperCase().indexOf(z + '-') === 0) r.push(l[i]); }
    if (cfg.orden === 'ubic') r.sort(function (a, b) { return a.ub < b.ub ? -1 : (a.ub > b.ub ? 1 : 0); });
    return r;
  }
  function pendientes() { var f = filtrar(items), r = [], i; for (i = 0; i < f.length; i++) { if (!hechos[f[i].cod + f[i].ub]) r.push(f[i]); } return r; }

  // ---- Voz (speechSynthesis, como el asistente de la app) ----
  var vozOk = false, vozLista = null;
  function elegirVoz() {
    try {
      var vs = window.speechSynthesis.getVoices() || [], pref = ['es-CL', 'es-MX', 'es-US', 'es-419', 'es-ES'], i, j;
      for (j = 0; j < pref.length; j++) { for (i = 0; i < vs.length; i++) { if ((vs[i].lang || '').replace('_', '-').toLowerCase() === pref[j].toLowerCase()) return vs[i]; } }
      for (i = 0; i < vs.length; i++) { if (/^es/i.test(vs[i].lang || '')) return vs[i]; }
    } catch (e) {}
    return null;
  }
  function hablar(t) {
    if (!cfg.voz || !t) return;
    try {
      var ss = window.speechSynthesis; if (!ss || !window.SpeechSynthesisUtterance) return;
      var u = new SpeechSynthesisUtterance(String(t)), v = elegirVoz(); u.lang = v ? v.lang : 'es-CL'; if (v) u.voice = v; u.rate = 1; u.volume = 1;
      try { ss.cancel(); } catch (e) {} ss.speak(u);
    } catch (e) {}
  }
  function activarVoz() { if (vozOk) return; vozOk = true; try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) {} }
  try { document.addEventListener('click', activarVoz, true); document.addEventListener('touchstart', activarVoz, true); if (window.speechSynthesis) window.speechSynthesis.getVoices(); } catch (e) {}
  // ---- Pitidos (WebAudio, no necesitan motor de voz) ----
  var actx = null;
  function pitar(tipo) {
    if (!cfg.tono) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; if (!actx) actx = new AC(); try { if (actx.resume) actx.resume(); } catch (e) {}
      var sec = tipo === 'cant' ? [[880, 0, 0.18], [1175, 0.22, 0.18], [1568, 0.44, 0.3]] : [[1000, 0, 0.12], [1000, 0.18, 0.12]], t0 = actx.currentTime, i, o, g;
      for (i = 0; i < sec.length; i++) { o = actx.createOscillator(); g = actx.createGain(); o.type = 'square'; o.frequency.value = sec[i][0]; g.gain.value = 0.25; o.connect(g); g.connect(actx.destination); o.start(t0 + sec[i][1]); o.stop(t0 + sec[i][1] + sec[i][2]); }
    } catch (e) {}
  }
  function diagVoz() {
    var t = 'speechSynthesis: ' + (window.speechSynthesis && window.SpeechSynthesisUtterance ? 'SI' : 'NO (este navegador no tiene voz)'), vs = [], i;
    try { vs = window.speechSynthesis.getVoices() || []; } catch (e) {}
    t += '\nVoces: ' + vs.length; var v = elegirVoz(); t += '\nVoz en español: ' + (v ? v.lang + ' ' + (v.name || '') : 'NO');
    t += '\nAudio (pitidos): ' + ((window.AudioContext || window.webkitAudioContext) ? 'SI' : 'NO');
    t += '\n\nSi hay voz en español, sonará "prueba de voz".'; alert(t); pitar('ubi'); hablar('prueba de voz');
  }
  function limpiaDes(d) { return String(d || '').replace(/[_*#\/]+/g, ' ').replace(/(\d),(\d)/g, '$1 coma $2').replace(/\s+/g, ' ').trim(); }
  var enCant = false;
  function pantallaCantidad(body) {
    if (!(/Digitaci[oó]n/i.test(body) && /Cantidad/i.test(body))) return 0;
    var m = body.match(/Cantidad(?!\s*(SKU|Total))\s*:?\s*\n?\s*(\d+(?:[.,]\d+)?)/i);
    return m ? m[2] : 0;
  }
  function evt(el, tipo, kc) { var e; try { e = document.createEvent('Event'); e.initEvent(tipo, true, true); if (kc) { e.keyCode = kc; e.which = kc; e.key = 'Enter'; } el.dispatchEvent(e); } catch (x) {} }
  function llenar(it) {
    if (!uInp) return; uInp.focus(); uInp.value = it.ub;
    evt(uInp, 'input'); evt(uInp, 'change'); evt(uInp, 'keydown', 13); evt(uInp, 'keypress', 13); evt(uInp, 'keyup', 13);
    ultCod = it.cod + it.ub; ultFill = new Date().getTime();
    pitar('ubi'); hablar(limpiaDes(it.des));
    setTimeout(function () { var r = buscarInputs(); if (r.p) { try { r.p.focus(); } catch (e) {} } }, 250);
  }
  // ---- Rotación mensual (la misma de la app de bodega, en Firebase): cada persona prioriza SU zona ----
  var NOMBRES = ['VICTOR URRA', 'IAN FIERRO', 'APOYO', 'JUAN PABLO'], ORD = ['F', 'FV', 'PB', 'VA'];
  function mesKey() { var d = new Date(), m = d.getMonth() + 1; return d.getFullYear() + '-' + (m < 10 ? '0' + m : m); }
  function sugerida(key) {
    var a = { F: 'VICTOR URRA', FV: 'IAN FIERRO', PB: 'APOYO', VA: 'JUAN PABLO' }, p = key.split('-'), diff = (parseInt(p[0], 10) - 2026) * 12 + (parseInt(p[1], 10) - 9), i, n, k;
    for (k = 0; k < Math.abs(diff); k++) { n = {}; for (i = 0; i < 4; i++) { n[ORD[i]] = a[ORD[(diff > 0 ? i + 1 : i + 3) % 4]]; } a = n; }
    return a;
  }
  function normN(t) { return String(t || '').toUpperCase().replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }
  function miZona() {
    if (!cfg.yo) return '';
    var asg = (cfg.rot && cfg.rot[mesKey()]) || sugerida(mesKey()), z, yo = normN(cfg.yo);
    for (z in asg) { if (normN(asg[z]) === yo) return z; }
    return '';
  }
  function cargarRot() {
    try { var x = new XMLHttpRequest(); x.open('GET', 'https://app-bodega-dimerc-default-rtdb.firebaseio.com/rotacion.json'); x.timeout = 8000;
      x.onload = function () { try { var j = JSON.parse(x.responseText); if (j && typeof j === 'object') { cfg.rot = j; cfgSet(cfg); } } catch (e) {} };
      x.send(); } catch (e) {}
  }
  function ordenZonas() { var m = miZona(), r = m ? [m] : [], o = ['F', 'FV', 'PB'], i; for (i = 0; i < o.length; i++) { if (o[i] !== m) r.push(o[i]); } return r; }
  var estVisto = false, estZona = '', selPrev = false;
  function enRango(n, spec) {
    var p = String(spec || '').split(','), i, m, a, b; n = parseInt(n, 10);
    for (i = 0; i < p.length; i++) { m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(p[i]); if (!m) continue; a = parseInt(m[1], 10); b = m[2] ? parseInt(m[2], 10) : a; if (n >= a && n <= b) return true; }
    return false;
  }
  function filaEstacion(spec) {
    var rows = document.getElementsByTagName('tr'), i, c;
    for (i = 0; i < rows.length; i++) { c = rows[i].children; if (c && c.length >= 2 && vis(rows[i]) && /^[0-9]{1,3}$/.test(txt(c[0])) && /^[0-9]+$/.test(txt(c[1])) && !rows[i].getElementsByTagName('table').length && enRango(txt(c[0]), spec)) return rows[i]; }
    return null;
  }
  function enSeleccionEstacion() { var b = document.body.innerText || ''; return /seleccione la estaci/i.test(b); }
  function autoEstacion() {
    if (!enSeleccionEstacion()) { estVisto = false; return ''; }
    var zs, k, z, spec, r, n;
    if (cfg.modo === 'auto') {
      if (!cfg.yo) return 'Toca 👤 para elegir quién eres (y usar tu zona de la rotación)';
      zs = ordenZonas();
    } else { if (cfg.zona === '*') return ''; zs = [cfg.zona]; }
    for (k = 0; k < zs.length; k++) {
      z = zs[k]; spec = cfg.estr[z]; if (!spec) continue; r = filaEstacion(spec);
      if (r) {
        n = txt(r.children[0]);
        if (cfg.auto && !(estVisto && estZona === z)) { estVisto = true; estZona = z; try { r.children[0].click(); } catch (e) {} }
        return 'Abriendo estación ' + n + ' (' + z + (cfg.modo === 'auto' && z === miZona() ? ' · tu zona' : '') + ')';
      }
    }
    return 'Sin estaciones de ' + zs.join('/') + ' en la lista';
  }
  var barra, info, msgEst = '';
  function pintar() {
    var pend = pendientes(), tot = filtrar(items).length, sig = pend[0];
    var b = barra.getElementsByTagName('button'), i; for (i = 0; i < b.length; i++) { var z = b[i].getAttribute('data-z'); if (z) { b[i].style.background = (cfg.modo === 'man' && z === cfg.zona) ? '#16a34a' : '#374151'; } }
    barra.querySelector('[data-m]').style.background = cfg.modo === 'auto' ? '#16a34a' : '#374151';
    barra.querySelector('[data-a]').style.background = cfg.auto ? '#16a34a' : '#b91c1c'; barra.querySelector('[data-a]').textContent = cfg.auto ? 'AUTO' : 'OFF';
    if (msgEst) { info.innerHTML = '<b>' + msgEst + '</b>'; return; }
    info.innerHTML = sig ? ('<b>' + (tot - pend.length + 1) + '/' + tot + '</b> ' + sig.ub + ' · ' + sig.cod + '<br><span style="opacity:.75">' + (sig.des || '').substr(0, 38) + '</span>') : (tot ? '✔ Zona ' + cfg.zona + ' lista (' + tot + ')' : 'Sin filas para ' + cfg.zona + ' (' + items.length + ' en pantalla)');
  }
  function bt(t, a, z) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (z) b.setAttribute('data-z', z); if (a === 'auto') b.setAttribute('data-a', '1'); b.style.cssText = 'margin:0 2px;padding:6px 8px;border:0;border-radius:6px;color:#fff;font:bold 13px Arial;background:#374151'; return b; }
  function montar() {
    barra = document.createElement('div'); barra.id = 'pk-barra';
    barra.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#111827;color:#fff;font:12px Arial;padding:5px;border-top:2px solid #16a34a;display:flex;align-items:center;flex-wrap:wrap';
    var zs = [['PB', 'PB'], ['FV', 'FV'], ['F', 'F'], ['Todas', '*']], i, b;
    for (i = 0; i < zs.length; i++) { b = bt(zs[i][0], null, zs[i][1]); (function (z) { b.onclick = function () { cfg.zona = z; cfg.modo = 'man'; cfgSet(cfg); idx = 0; ultCod = ''; pintar(); }; })(zs[i][1]); barra.appendChild(b); }
    b = bt('AUTO', 'auto'); b.onclick = function () { cfg.auto = !cfg.auto; cfgSet(cfg); ultCod = ''; pintar(); }; barra.appendChild(b);
    b = bt('⏭'); b.title = 'Saltar este producto'; b.onclick = function () { var p = pendientes()[0]; if (p) { hechos[p.cod + p.ub] = 1; ultCod = ''; var s = pendientes()[0]; if (s && cfg.auto) llenar(s); pintar(); } }; barra.appendChild(b);
    b = bt('↺'); b.title = 'Reiniciar lista'; b.onclick = function () { hechos = {}; ultCod = ''; pintar(); }; barra.appendChild(b);
    b = bt('↕'); b.title = 'Orden: lista / ubicación'; b.onclick = function () { cfg.orden = cfg.orden === 'lista' ? 'ubic' : 'lista'; cfgSet(cfg); ultCod = ''; alert('Orden: ' + (cfg.orden === 'lista' ? 'como sale en la lista (arriba→abajo)' : 'por ubicación (A→Z)')); pintar(); }; barra.appendChild(b);
    b = bt('🎯'); b.title = 'Mi zona de la rotación primero'; b.setAttribute('data-m', '1'); b.onclick = function () { cfg.modo = 'auto'; cfgSet(cfg); estVisto = false; ultCod = ''; pintar(); }; barra.appendChild(b);
    b = bt('👤'); b.title = '¿Quién eres?'; b.onclick = function () { var t = 'Elige quién eres (número):\n', i, v; for (i = 0; i < NOMBRES.length; i++) { t += (i + 1) + ') ' + NOMBRES[i] + '\n'; } t += 'Actual: ' + (cfg.yo || '—') + (miZona() ? ' → zona ' + miZona() : ''); v = prompt(t, ''); if (v === null || v === '') return; i = parseInt(v, 10); if (i >= 1 && i <= NOMBRES.length) { cfg.yo = NOMBRES[i - 1]; cfgSet(cfg); estVisto = false; pintar(); alert('Listo: ' + cfg.yo + (miZona() ? ' · zona ' + miZona() : ' · sin zona este mes')); } }; barra.appendChild(b);
    b = bt('🏭'); b.title = 'Estación de esta zona'; b.onclick = function () { if (cfg.zona === '*') { alert('Elige PB, FV o F primero.'); return; } var v = prompt('Estaciones de ' + cfg.zona + ' (ej: 22-29 o 7,11):', cfg.estr[cfg.zona] || ''); if (v !== null) { cfg.estr[cfg.zona] = String(v).replace(/\s+/g, ''); cfgSet(cfg); estVisto = false; pintar(); } }; barra.appendChild(b);
    b = bt(cfg.voz ? '🔊' : '🔇'); b.title = 'Voz'; b.onclick = function () { cfg.voz = !cfg.voz; cfgSet(cfg); this.textContent = cfg.voz ? '🔊' : '🔇'; activarVoz(); if (cfg.voz) hablar('Voz activada'); }; barra.appendChild(b);
    b = bt(cfg.tono ? '🔔' : '🔕'); b.title = 'Pitidos'; b.onclick = function () { cfg.tono = !cfg.tono; cfgSet(cfg); this.textContent = cfg.tono ? '🔔' : '🔕'; activarVoz(); pitar('ubi'); }; barra.appendChild(b);
    b = bt('🗣'); b.title = 'Diagnóstico de voz'; b.onclick = diagVoz; barra.appendChild(b);
    b = bt('?'); b.title = 'Diagnóstico'; b.onclick = function () { var r = buscarInputs(); alert('Campo ubicación: ' + (r.u ? 'OK' : 'NO') + '\nCampo producto: ' + (r.p ? 'OK' : 'NO') + '\nFilas leídas: ' + items.length + '\nZona: ' + cfg.zona + ' (' + filtrar(items).length + ')\nPendientes: ' + pendientes().length + (items[0] ? '\nEj.: ' + items[0].cod + ' ' + items[0].ub : '')); }; barra.appendChild(b);
    b = bt('✕'); b.onclick = function () { barra.style.display = 'none'; }; barra.appendChild(b);
    info = document.createElement('div'); info.style.cssText = 'flex:1 1 100%;margin-top:3px;line-height:1.25'; barra.appendChild(info);
    document.body.appendChild(barra);
  }
  function sinMemoria() {
    var ins = document.getElementsByTagName('input'), i, f = document.getElementsByTagName('form');
    for (i = 0; i < f.length; i++) { if (f[i].getAttribute('autocomplete') !== 'off') f[i].setAttribute('autocomplete', 'off'); }
    var dl = document.getElementsByTagName('datalist'); for (i = 0; i < dl.length; i++) { if (dl[i].children.length) dl[i].innerHTML = ''; }
    for (i = 0; i < ins.length; i++) { if (ins[i].getAttribute('list')) ins[i].removeAttribute('list'); }
    for (i = 0; i < ins.length; i++) { if (ins[i].type !== 'password' && ins[i].getAttribute('autocomplete') !== 'off') { ins[i].setAttribute('autocomplete', 'off'); ins[i].setAttribute('autocorrect', 'off'); ins[i].setAttribute('autocapitalize', 'off'); ins[i].setAttribute('spellcheck', 'false'); } }
  }
  function tick() {
    sinMemoria();
    var sel = enSeleccionEstacion(); if (sel && !selPrev) { items = []; hechos = {}; ultCod = ''; } selPrev = sel;
    msgEst = autoEstacion();
    var r = buscarInputs(); uInp = r.u; pInp = r.p; var f = sel ? [] : leerFilas(); if (f.length) items = f;
    var body = (document.body.innerText || ''), msg = /PIQUEADO\.\./i.test(body) && !/BULTO PIQUEADO/i.test(body);
    if (msg && !vioMsg) { vioMsg = true; var p0 = pendientes()[0]; if (p0 && ultCod === p0.cod + p0.ub) { hechos[p0.cod + p0.ub] = 1; ultCod = ''; } }
    if (!msg) vioMsg = false;
    var dlg = /OK!|PIQUEADO|swal2?-/i.test(body) && (document.querySelector('.swal2-container,.sweet-alert,.swal-overlay,.modal.in,.modal.show') !== null);
    var cq = pantallaCantidad(body); if (cq && !enCant) { enCant = true; pitar('cant'); hablar('Cantidad ' + String(cq).replace(',', ' coma ')); } if (!cq) enCant = false;
    var sig = pendientes()[0];
    if (cfg.auto && !sel && uInp && sig && !dlg && !uInp.value && (ultCod !== sig.cod + sig.ub || new Date().getTime() - ultFill > 6000)) llenar(sig);
    pintar();
  }
  montar(); cargarRot(); tick(); setInterval(tick, 800); setInterval(cargarRot, 600000);
  window.__pkAuto = { mostrar: function () { barra.style.display = 'flex'; } };
})();
