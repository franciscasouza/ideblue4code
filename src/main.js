import './style.css';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as Pt from 'blockly/msg/pt-br';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { toolbox, programaInicial, definirPlaca } from './blocks.js';
import { arduino } from './generator.js';
import * as serial from './serial.js';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
Blockly.setLocale(Pt);

const $ = (id) => document.getElementById(id);
const consoleEl = $('console');
function log(msg, substituir = false) {
  if (substituir && consoleEl.lastChild?.dataset?.prog) consoleEl.lastChild.remove();
  const linha = document.createElement('div');
  linha.textContent = msg;
  if (substituir) linha.dataset.prog = '1';
  consoleEl.appendChild(linha);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ---------- Blocos ----------
const tema = Blockly.Theme.defineTheme('carrinos', {
  base: Blockly.Themes.Classic,
  componentStyles: { workspaceBackgroundColour: '#fbfcfd', toolboxBackgroundColour: '#eef2f5', flyoutBackgroundColour: '#e4eaef', scrollbarColour: '#c5cdd5' },
  fontStyle: { family: 'system-ui, sans-serif', size: 11 },
});
const ws = Blockly.inject($('blockly'), {
  toolbox, theme: tema, renderer: 'thrasos', trashcan: true, media: '/media/',
  zoom: { controls: true, wheel: true, startScale: 0.95 },
  grid: { spacing: 24, length: 2, colour: '#e3e8ed', snap: true },
});

const SALVO = 'carrinos.projeto';
function carregarProjeto(p) {
  ws.clear();
  Blockly.serialization.workspaces.load(p.blocos || programaInicial, ws);
  if (!ws.getBlocksByType('arduino_programa').length) {
    Blockly.serialization.workspaces.load(programaInicial, ws);
  }
  if (p.codigoManual) { editor.setValue(p.codigoManual); desligarBlocos(); } else religarBlocos();
}

function gerarCodigo() {
  const prog = ws.getBlocksByType('arduino_programa')[0];
  arduino.init(ws);
  const corpo = prog ? arduino.blockToCode(prog) : 'void setup() {}\n\nvoid loop() {}\n';
  return arduino.finish(corpo);
}

// ---------- Código ----------
const editor = monaco.editor.create($('monaco'), {
  language: 'cpp', automaticLayout: true, minimap: { enabled: false }, fontSize: 13, tabSize: 2,
});
let modoManual = false, escrevendo = false;
function atualizarCodigo() {
  if (modoManual) return;
  escrevendo = true; editor.setValue(gerarCodigo()); escrevendo = false;
  salvarLocal();
}
function desligarBlocos() { modoManual = true; $('detached').classList.remove('hidden'); }
function religarBlocos() { modoManual = false; $('detached').classList.add('hidden'); atualizarCodigo(); }
editor.onDidChangeModelContent(() => { if (!escrevendo && !modoManual) desligarBlocos(); if (modoManual) salvarLocal(); });
$('btn-reattach').onclick = () => {
  if (confirm('As mudanças feitas à mão no código serão perdidas. Continuar?')) religarBlocos();
};
ws.addChangeListener((e) => { if (!e.isUiEvent) atualizarCodigo(); });

function projetoAtual() {
  return { versao: 1, placa: $('board').value, blocos: Blockly.serialization.workspaces.save(ws), codigoManual: modoManual ? editor.getValue() : null };
}
function salvarLocal() { try { localStorage.setItem(SALVO, JSON.stringify(projetoAtual())); } catch {} }

try { const p = JSON.parse(localStorage.getItem(SALVO)); if (p) { $('board').value = p.placa || 'uno'; definirPlaca($('board').value); carregarProjeto(p); } else carregarProjeto({}); }
catch { carregarProjeto({}); }

// ---------- Salvar / abrir ----------
$('btn-save').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(projetoAtual(), null, 2)], { type: 'application/json' }));
  a.download = 'meu-projeto.carrinos.json';
  a.click();
};
$('btn-open').onclick = () => $('file-open').click();
let hexCarregado = null;
$('file-open').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const txt = await f.text();
  if (f.name.endsWith('.hex')) { hexCarregado = txt; log(`Arquivo ${f.name} pronto para enviar.`); }
  else if (f.name.endsWith('.ino')) { editor.setValue(txt); desligarBlocos(); }
  else carregarProjeto(JSON.parse(txt));
  e.target.value = '';
};

// ---------- Placa ----------
let porta = null, fecharMonitor = null;
if (!serial.suportado()) {
  $('board-status').textContent = 'Use Chrome ou Edge no computador para conectar a placa';
  $('btn-connect').disabled = true;
}
function mostrarPlaca() {
  const s = $('board-status');
  if (!porta) { s.textContent = 'Nenhuma placa'; s.className = 'status off'; return; }
  const d = serial.descreverPorta(porta);
  s.textContent = d.nome; s.className = 'status on';
  if (d.sugestao) { $('board').value = d.sugestao; definirPlaca(d.sugestao); salvarLocal(); }
  else if (d.generica) log('Placa genérica detectada: escolha na lista se é Uno, Nano ou Mega.');
}
$('btn-connect').onclick = async () => {
  try { porta = await serial.pedirPorta(); mostrarPlaca(); log(`Placa conectada: ${serial.descreverPorta(porta).nome}`); }
  catch (e) { if (e.name !== 'NotFoundError') log('Erro ao conectar: ' + e.message); }
};
if (serial.suportado()) {
  navigator.serial.getPorts().then((ps) => { if (ps.length) { porta = ps[0]; mostrarPlaca(); } });
  navigator.serial.addEventListener('connect', (e) => { porta = e.target; mostrarPlaca(); log('Placa ligada no USB.'); });
  navigator.serial.addEventListener('disconnect', (e) => { if (e.target === porta) { porta = null; fecharMonitor = null; mostrarPlaca(); log('Placa desconectada.'); } });
}

async function pararMonitor() {
  if (fecharMonitor) { await fecharMonitor(); fecharMonitor = null; $('btn-monitor').textContent = 'Abrir monitor'; }
}
$('btn-monitor').onclick = async () => {
  if (fecharMonitor) return pararMonitor();
  if (!porta) return log('Conecte a placa primeiro.');
  fecharMonitor = await serial.abrirMonitor(porta, Number($('baud').value), (t) => {
    consoleEl.append(t); consoleEl.scrollTop = consoleEl.scrollHeight;
  });
  $('btn-monitor').textContent = 'Fechar monitor';
};
$('btn-clear').onclick = () => { consoleEl.textContent = ''; };

async function compilar(codigo, fqbn) {
  log('Compilando...');
  const r = await fetch('/api/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fqbn, code: codigo }) });
  const j = await r.json().catch(() => ({ error: 'Servidor de compilação indisponível.' }));
  if (!r.ok || j.error) throw new Error(j.error || 'Falha ao compilar.');
  log(`Compilado: ${j.size ?? '?'} bytes.`);
  return j.hex;
}

$('btn-upload').onclick = async () => {
  if (!porta) return log('Conecte a placa primeiro (botão "Conectar placa").');
  const btn = $('btn-upload'); btn.disabled = true;
  try {
    await pararMonitor();
    const perfil = serial.PERFIS[$('board').value];
    const hex = hexCarregado || await compilar(editor.getValue(), perfil.fqbn);
    hexCarregado = null;
    await serial.gravar(porta, hex, perfil, log);
  } catch (e) {
    log('Erro: ' + e.message);
  } finally { btn.disabled = false; }
};
$('board').onchange = () => { definirPlaca($('board').value); salvarLocal(); };
