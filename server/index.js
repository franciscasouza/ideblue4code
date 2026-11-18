// Servidor: entrega o site e compila sketches com arduino-cli.
import http from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const PORTA = Number(process.env.PORT || 8080);
const DIST = path.resolve(process.env.DIST_DIR || 'dist');
const CLI = process.env.ARDUINO_CLI || 'arduino-cli';
const PLACAS = new Set(['arduino:avr:uno', 'arduino:avr:nano:cpu=atmega328', 'arduino:avr:nano:cpu=atmega328old', 'arduino:avr:mega:cpu=atmega2560']);
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.cur': 'image/x-icon' };
let fila = Promise.resolve();

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function rodar(args, timeout = 90000) {
  return new Promise((ok) => execFile(CLI, args, { timeout, maxBuffer: 4 << 20 }, (err, stdout, stderr) => ok({ err, stdout, stderr })));
}

async function compilar(code, fqbn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sk-'));
  const sketch = path.join(dir, 'sketch');
  const out = path.join(dir, 'out');
  try {
    await fs.mkdir(sketch);
    await fs.writeFile(path.join(sketch, 'sketch.ino'), code);
    const r = await rodar(['compile', '--fqbn', fqbn, '--output-dir', out, sketch]);
    if (r.err) {
      const msg = (r.stderr || r.stdout || String(r.err)).replaceAll(sketch + path.sep, '');
      return { status: 400, body: { error: msg.trim().slice(0, 4000) } };
    }
    const hex = await fs.readFile(path.join(out, 'sketch.ino.hex'), 'utf8');
    const m = r.stdout.match(/uses (\d+) bytes/);
    return { status: 200, body: { hex, size: m ? Number(m[1]) : null } };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/compile') {
    let corpo = '';
    for await (const parte of req) { corpo += parte; if (corpo.length > 200000) return json(res, 413, { error: 'Programa grande demais.' }); }
    let dados;
    try { dados = JSON.parse(corpo); } catch { return json(res, 400, { error: 'JSON inválido.' }); }
    if (typeof dados.code !== 'string' || !PLACAS.has(dados.fqbn)) return json(res, 400, { error: 'Placa não suportada.' });
    // Uma compilação por vez para não sobrecarregar a VPS.
    const r = await (fila = fila.then(() => compilar(dados.code, dados.fqbn), () => compilar(dados.code, dados.fqbn)));
    return json(res, r.status, r.body);
  }
  if (req.url === '/api/health') return json(res, 200, { ok: true });
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });

  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let arquivo = path.join(DIST, path.normalize(rel));
  if (!arquivo.startsWith(DIST)) return json(res, 403, { error: 'Proibido.' });
  try { if ((await fs.stat(arquivo)).isDirectory()) arquivo = path.join(arquivo, 'index.html'); }
  catch { arquivo = path.join(DIST, 'index.html'); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
  createReadStream(arquivo).pipe(res);
}).listen(PORTA, () => console.log(`Carrinos IDE em http://localhost:${PORTA}`));
