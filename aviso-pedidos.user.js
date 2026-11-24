// ==UserScript==
// @name         Aviso de pedidos - Cajas Sin Piqueo
// @namespace    vxniel
// @version      1.1
// @updateURL    https://vxniel.github.io/logisticCCP/aviso-pedidos.user.js
// @downloadURL  https://vxniel.github.io/logisticCCP/aviso-pedidos.user.js
// @description  Avisa (pantalla + vibración + pitido) cuando suben los pedidos ALTA / MEDIA / BAJA / VOLUMEN
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  // ───── Ajustes ─────
  var SEGUNDOS = 45;                                   // cada cuánto se revisa (recarga la página)
  var ETIQUETAS = ['ALTA', 'MEDIA', 'BAJA', 'VOLUMEN']; // qué contadores vigilar
  // ──────────────────
  var CLAVE = 'avisoPedidos_v1';
  var cuerpo = (document.body && document.body.innerText || '').toUpperCase();
  if (cuerpo.indexOf('CAJAS SIN PIQUEO') < 0) return;   // solo actúa en ese tablero

  function leer() {
    var res = {}, nodos = document.querySelectorAll('body *');
    for (var i = 0; i < nodos.length; i++) {
      var n = nodos[i];
      if (n.children.length) continue;
      var t = (n.textContent || '').replace(/\s+/g, '');
      if (!/^\d{1,6}$/.test(t)) continue;
      var a = n;
      for (var k = 0; k < 4 && a.parentElement; k++) {
        a = a.parentElement;
        var tx = (a.innerText || a.textContent || '').toUpperCase();
        if (tx.length > 60) break;
        var hallada = null, cuantas = 0;
        for (var j = 0; j < ETIQUETAS.length; j++) { if (tx.indexOf(ETIQUETAS[j]) >= 0) { hallada = ETIQUETAS[j]; cuantas++; } }
        if (cuantas === 1) { if (res[hallada] === undefined) res[hallada] = parseInt(t, 10); break; }
      }
    }
    return res;
  }

  var ctxAudio = null;
  function ctx() {
    try { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; if (!ctxAudio) ctxAudio = new C(); if (ctxAudio.state === 'suspended' && ctxAudio.resume) ctxAudio.resume(); return ctxAudio; } catch (e) { return null; }
  }
  // Los navegadores solo dejan sonar tras un toque del usuario: se "desbloquea" con el primer toque en la página
  ['touchstart', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { ctx(); }, true); });
  function pitido() {
    try {
      var c = ctx(); if (!c) return; var veces = 4;
      for (var i = 0; i < veces; i++) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'square'; o.frequency.value = 1200; g.gain.value = 1; o.connect(g); g.connect(c.destination);
        o.start(c.currentTime + i * 0.35); o.stop(c.currentTime + i * 0.35 + 0.2);
      }
    } catch (e) {}
  }

  function avisar(cambios) {
    try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {}
    pitido();
    try { if (window.Notification && Notification.permission === 'granted') new Notification('Nuevos pedidos', { body: cambios.join(' · ') }); } catch (e) {}
    var d = document.createElement('div');
    d.setAttribute('style', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:rgba(200,30,30,.96);color:#fff;font:bold 22px sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px');
    d.innerHTML = '<div>🔔 NUEVOS PEDIDOS<br><br>' + cambios.join('<br>') + '<br><br><span style="font-size:16px;font-weight:normal">Toca para cerrar</span></div>';
    d.onclick = function () { d.parentNode && d.parentNode.removeChild(d); };
    document.body.appendChild(d);
  }

  function insignia(texto) {
    var b = document.createElement('div');
    b.setAttribute('style', 'position:fixed;left:6px;bottom:6px;z-index:2147483646;background:#0a7d2c;color:#fff;font:bold 13px sans-serif;padding:6px 10px;border-radius:14px;opacity:.9');
    b.textContent = texto;
    b.onclick = function () { ctx(); avisar(['PRUEBA: así sonará y se verá el aviso']); };
    document.body.appendChild(b);
  }

  var actual = leer(), hay = false, k;
  for (k in actual) { hay = true; }
  var estado = {};
  try { estado = JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch (e) {}
  if (hay) {
    estado.vacias = 0;
    var cambios = [];
    if (estado.v) {
      for (k in actual) { if (estado.v[k] !== undefined && actual[k] > estado.v[k]) cambios.push(k + ': ' + estado.v[k] + ' → ' + actual[k] + ' (+' + (actual[k] - estado.v[k]) + ')'); }
    }
    estado.v = actual; estado.t = new Date().getTime();
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) {}
    if (cambios.length) avisar(cambios);
  } else {
    estado.vacias = (estado.vacias || 0) + 1;      // si no encuentra contadores (p. ej. pidió login), deja de recargar
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) {}
  }
  var resumen = ''; for (k in actual) { resumen += k.charAt(0) + actual[k] + ' '; }
  insignia(hay ? ('🔔 Aviso activo · ' + resumen + '· toca para probar') : '⚠ Aviso: no encuentro los contadores');
  if (estado.vacias >= 3) return;
  setTimeout(function () { if (!document.getElementById('avisoPedidosPausa')) location.reload(); }, SEGUNDOS * 1000);
})();
