// Conexão com a placa via Web Serial: detecção, monitor serial e gravação STK500v1.

const PLACAS_USB = [
  { vid: 0x2341, nome: 'Arduino (oficial)' },
  { vid: 0x2a03, nome: 'Arduino (oficial)' },
  { vid: 0x1a86, nome: 'Arduino compatível (chip CH340)' },
  { vid: 0x0403, nome: 'Arduino compatível (chip FTDI)' },
  { vid: 0x10c4, nome: 'Placa com chip CP210x (ex.: ESP32)' },
];
const NOMES_PID = { 0x0043: 'Uno', 0x0001: 'Uno', 0x0243: 'Uno', 0x0042: 'Mega 2560', 0x0010: 'Mega 2560', 0x8036: 'Leonardo', 0x0058: 'Nano Every' };

export const PERFIS = {
  uno: { baud: 115200, fqbn: 'arduino:avr:uno' },
  nano: { baud: 115200, fqbn: 'arduino:avr:nano:cpu=atmega328' },
  'nano-old': { baud: 57600, fqbn: 'arduino:avr:nano:cpu=atmega328old' },
  mega: { baud: 115200, fqbn: 'arduino:avr:mega:cpu=atmega2560', protocolo: 'stk500v2', pagina: 256 },
};

export const suportado = () => 'serial' in navigator;

export function descreverPorta(port) {
  const { usbVendorId: vid, usbProductId: pid } = port.getInfo();
  const fab = PLACAS_USB.find((p) => p.vid === vid);
  if (!fab) return { nome: vid ? 'Dispositivo USB desconhecido' : 'Porta serial', vid, pid };
  const modelo = vid === 0x2341 || vid === 0x2a03 ? NOMES_PID[pid] : null;
  // Clones (CH340, FTDI) usam o mesmo chip USB em Uno, Nano e Mega: a pessoa escolhe a placa na lista.
  const sugestao = { Uno: 'uno', 'Mega 2560': 'mega' }[modelo] || null;
  return { nome: modelo ? `Arduino ${modelo}` : fab.nome, vid, pid, sugestao, generica: !modelo };
}

export async function pedirPorta() {
  return navigator.serial.requestPort({ filters: PLACAS_USB.map((p) => ({ usbVendorId: p.vid })) });
}

// Leitor com buffer para conversar com o bootloader.
class Canal {
  constructor(port) { this.port = port; this.buf = []; this.esperando = null; }
  async abrir(baud) {
    await this.port.open({ baudRate: baud });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.lendo = (async () => {
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          this.buf.push(...value);
          if (this.esperando) this.esperando();
        }
      } catch { /* porta fechada */ }
    })();
  }
  escrever(bytes) { return this.writer.write(new Uint8Array(bytes)); }
  async ler(n, ms = 1000) {
    const fim = Date.now() + ms;
    while (this.buf.length < n) {
      const resta = fim - Date.now();
      if (resta <= 0) throw new Error('A placa não respondeu a tempo.');
      await new Promise((ok) => { this.esperando = ok; setTimeout(ok, resta); });
      this.esperando = null;
    }
    return this.buf.splice(0, n);
  }
  limpar() { this.buf = []; }
  async fechar() {
    try { await this.reader.cancel(); } catch {}
    await this.lendo;
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.port.close();
  }
}

const STK = { OK: 0x10, INSYNC: 0x14, CRC_EOP: 0x20, GET_SYNC: 0x30, ENTER: 0x50, LEAVE: 0x51, LOAD_ADDR: 0x55, PROG_PAGE: 0x64, READ_PAGE: 0x74 };

async function comando(c, bytes, extra = 0, ms = 1000) {
  await c.escrever([...bytes, STK.CRC_EOP]);
  const r = await c.ler(2 + extra, ms);
  if (r[0] !== STK.INSYNC || r[r.length - 1] !== STK.OK) throw new Error('Resposta inesperada do bootloader.');
  return r.slice(1, 1 + extra);
}

export function lerHex(texto) {
  const mem = new Uint8Array(262144).fill(0xff);
  let base = 0, max = 0;
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.startsWith(':')) continue;
    const b = linha.slice(1).match(/../g).map((h) => parseInt(h, 16));
    const [len, hi, lo, tipo] = b;
    if (b.reduce((s, x) => s + x, 0) & 0xff) throw new Error('Arquivo .hex corrompido.');
    if (tipo === 0) {
      const addr = base + (hi << 8 | lo);
      mem.set(b.slice(4, 4 + len), addr);
      max = Math.max(max, addr + len);
    } else if (tipo === 2) base = (b[4] << 8 | b[5]) << 4;
    else if (tipo === 4) base = (b[4] << 8 | b[5]) << 16;
  }
  return mem.slice(0, max);
}

export async function gravar(port, hexTexto, perfil, log = () => {}) {
  const dados = lerHex(hexTexto);
  const c = new Canal(port);
  await c.abrir(perfil.baud);
  try {
    log('Reiniciando a placa...');
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await new Promise((r) => setTimeout(r, 250));
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await new Promise((r) => setTimeout(r, 50));
    c.limpar();
    if (perfil.protocolo === 'stk500v2') await gravarV2(c, dados, perfil.pagina, log);
    else await gravarV1(c, dados, log);
    log(`Pronto! ${dados.length} bytes gravados.`);
  } finally {
    await c.fechar();
  }
}

// STK500v1 (Optiboot): Uno, Nano
async function gravarV1(c, dados, log) {
  const PAGINA = 128;
  {
    let sync = false;
    for (let i = 0; i < 10 && !sync; i++) {
      try { await comando(c, [STK.GET_SYNC], 0, 300); sync = true; } catch { c.limpar(); }
    }
    if (!sync) throw new Error('Não consegui falar com o bootloader. Confira se a placa escolhida está certa.');

    await comando(c, [STK.ENTER]);
    for (let addr = 0; addr < dados.length; addr += PAGINA) {
      const pag = dados.slice(addr, addr + PAGINA);
      const w = addr >> 1;
      await comando(c, [STK.LOAD_ADDR, w & 0xff, w >> 8]);
      await comando(c, [STK.PROG_PAGE, pag.length >> 8, pag.length & 0xff, 0x46, ...pag]);
      log(`Gravando... ${Math.min(100, Math.round(((addr + PAGINA) / dados.length) * 100))}%`, true);
    }
    log('Conferindo...');
    for (let addr = 0; addr < dados.length; addr += PAGINA) {
      const pag = dados.slice(addr, addr + PAGINA);
      const w = addr >> 1;
      await comando(c, [STK.LOAD_ADDR, w & 0xff, w >> 8]);
      const lido = await comando(c, [STK.READ_PAGE, pag.length >> 8, pag.length & 0xff, 0x46], pag.length);
      if (lido.some((x, i) => x !== pag[i])) throw new Error(`Erro na conferência no endereço ${addr}.`);
    }
    await comando(c, [STK.LEAVE]);
  }
}

// STK500v2 (bootloader do Mega 2560)
async function gravarV2(c, dados, PAGINA, log) {
  let seq = 0;
  async function msg(corpo, ms = 1000) {
    seq = (seq + 1) & 0xff;
    const m = [0x1b, seq, corpo.length >> 8, corpo.length & 0xff, 0x0e, ...corpo];
    m.push(m.reduce((x, y) => x ^ y, 0));
    await c.escrever(m);
    const cab = await c.ler(5, ms);
    if (cab[0] !== 0x1b || cab[4] !== 0x0e) throw new Error('Resposta inesperada do bootloader.');
    const n = cab[2] << 8 | cab[3];
    const resto = await c.ler(n + 1, ms);
    const r = resto.slice(0, n);
    if (r[0] !== corpo[0] || r[1] !== 0x00) throw new Error('O bootloader recusou o comando.');
    return r;
  }
  let ok = false;
  for (let i = 0; i < 10 && !ok; i++) {
    try { await msg([0x01], 300); ok = true; } catch { c.limpar(); }
  }
  if (!ok) throw new Error('Não consegui falar com o bootloader. Confira se a placa escolhida é o Mega.');
  await msg([0x10, 200, 100, 25, 32, 0, 0x53, 3, 0xac, 0x53, 0, 0]);
  const endereco = (addr) => { const w = addr >> 1; return [0x06, 0x80 | (w >> 24 & 0x7f), w >> 16 & 0xff, w >> 8 & 0xff, w & 0xff]; };
  for (let addr = 0; addr < dados.length; addr += PAGINA) {
    const pag = dados.slice(addr, addr + PAGINA);
    await msg(endereco(addr));
    await msg([0x13, pag.length >> 8, pag.length & 0xff, 0xc1, 10, 0x40, 0x4c, 0x20, 0x00, 0x00, ...pag]);
    log(`Gravando... ${Math.min(100, Math.round(((addr + PAGINA) / dados.length) * 100))}%`, true);
  }
  log('Conferindo...');
  for (let addr = 0; addr < dados.length; addr += PAGINA) {
    const pag = dados.slice(addr, addr + PAGINA);
    await msg(endereco(addr));
    const r = await msg([0x14, pag.length >> 8, pag.length & 0xff, 0x20]);
    if (r.slice(2, 2 + pag.length).some((x, i) => x !== pag[i])) throw new Error(`Erro na conferência no endereço ${addr}.`);
  }
  await msg([0x11, 1, 1]);
}

export async function abrirMonitor(port, baud, aoReceber) {
  await port.open({ baudRate: baud });
  const reader = port.readable.getReader();
  const dec = new TextDecoder();
  const lendo = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        aoReceber(dec.decode(value, { stream: true }));
      }
    } catch {}
  })();
  return async () => {
    try { await reader.cancel(); } catch {}
    await lendo;
    reader.releaseLock();
    await port.close();
  };
}
