// Genera index.html (compatible con Chrome/WebView antiguos de las Zebra) a partir de fuente/index.src.html
// Uso: NODE_PATH=<dir con @babel/core y @babel/preset-env> node construir.js
const fs = require('fs'), path = require('path');
const babel = require('@babel/core');
const origen = path.join(__dirname, 'fuente', 'index.src.html');
const destino = path.join(__dirname, 'index.html');
let html = fs.readFileSync(origen, 'utf8');
let n = 0;
html = html.replace(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs, code) => {
  if (!code.trim()) return m;
  const out = babel.transformSync(code, {
    sourceType: 'script', compact: true, comments: false, babelrc: false, configFile: false,
    presets: [[require.resolve('@babel/preset-env'), { targets: { chrome: '40' }, modules: false }]]
  }).code;
  n++;
  return '<script' + attrs + '>' + out.replace(/<\/script/gi, '<\\/script') + '</script>';
});
fs.writeFileSync(destino, html);
console.log('index.html generado:', (html.length / 1048576).toFixed(2), 'MB,', n, 'scripts transpilados');
