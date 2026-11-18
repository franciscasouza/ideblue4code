// Blocos de Arduino (em português) para o Blockly.
import * as Blockly from 'blockly/core';

const C = { base: '#0b7a75', io: '#2563eb', tempo: '#7c3aed', serial: '#b45309', motor: '#be123c' };

// Os pinos disponíveis mudam conforme a placa escolhida.
let placa = 'uno';
export const definirPlaca = (p) => { placa = p; };
const par = (p) => [String(p), String(p)];
const intervalo = (n, pre = '') => Array.from({ length: n }, (_, i) => par(pre + i));
const PINOS = {
  digital: () => intervalo(placa === 'mega' ? 54 : 14),
  analog: () => intervalo(placa === 'mega' ? 16 : placa.startsWith('nano') ? 8 : 6, 'A'),
  pwm: () => (placa === 'mega' ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46] : [3, 5, 6, 9, 10, 11]).map(par),
};
class FieldPino extends Blockly.FieldDropdown {
  static fromJson(o) { return new FieldPino(PINOS[o.tipo]); }
}
Blockly.fieldRegistry.register('field_pino', FieldPino);
const PINOS_DIGITAIS = 'digital', PINOS_ANALOG = 'analog', PINOS_PWM = 'pwm';

Blockly.defineBlocksWithJsonArray([
  {
    type: 'arduino_programa',
    message0: 'ao ligar %1 %2 repetir para sempre %3 %4',
    args0: [
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'SETUP' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'LOOP' },
    ],
    colour: C.base,
    tooltip: 'Programa principal: o que roda uma vez ao ligar e o que repete para sempre.',
    deletable: false,
  },
  {
    type: 'arduino_escrever_digital',
    message0: 'ligar pino %1 em %2',
    args0: [
      { type: 'field_pino', name: 'PINO', tipo: PINOS_DIGITAIS },
      { type: 'field_dropdown', name: 'ESTADO', options: [['ALTO (ligado)', 'HIGH'], ['BAIXO (desligado)', 'LOW']] },
    ],
    previousStatement: null, nextStatement: null, colour: C.io,
  },
  {
    type: 'arduino_led_embutido',
    message0: 'LED da placa %1',
    args0: [{ type: 'field_dropdown', name: 'ESTADO', options: [['ligar', 'HIGH'], ['desligar', 'LOW']] }],
    previousStatement: null, nextStatement: null, colour: C.io,
  },
  {
    type: 'arduino_ler_digital',
    message0: 'pino digital %1 está ligado?',
    args0: [{ type: 'field_pino', name: 'PINO', tipo: PINOS_DIGITAIS }],
    output: 'Boolean', colour: C.io,
  },
  {
    type: 'arduino_ler_analogico',
    message0: 'ler pino analógico %1',
    args0: [{ type: 'field_pino', name: 'PINO', tipo: PINOS_ANALOG }],
    output: 'Number', colour: C.io,
  },
  {
    type: 'arduino_escrever_pwm',
    message0: 'potência do pino %1 em %2 (0 a 255)',
    args0: [
      { type: 'field_pino', name: 'PINO', tipo: PINOS_PWM },
      { type: 'input_value', name: 'VALOR', check: 'Number' },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null, colour: C.io,
  },
  {
    type: 'arduino_esperar',
    message0: 'esperar %1 milissegundos',
    args0: [{ type: 'input_value', name: 'MS', check: 'Number' }],
    inputsInline: true, previousStatement: null, nextStatement: null, colour: C.tempo,
  },
  {
    type: 'arduino_millis',
    message0: 'tempo desde que ligou (ms)',
    output: 'Number', colour: C.tempo,
  },
  {
    type: 'arduino_serial_escrever',
    message0: 'mostrar no monitor serial %1',
    args0: [{ type: 'input_value', name: 'TEXTO' }],
    inputsInline: true, previousStatement: null, nextStatement: null, colour: C.serial,
  },
  {
    type: 'arduino_distancia',
    message0: 'distância em cm (trig %1 echo %2)',
    args0: [
      { type: 'field_pino', name: 'TRIG', tipo: PINOS_DIGITAIS },
      { type: 'field_pino', name: 'ECHO', tipo: PINOS_DIGITAIS },
    ],
    output: 'Number', colour: C.motor,
    tooltip: 'Sensor ultrassônico HC-SR04.',
  },
  {
    type: 'arduino_motor',
    message0: 'motor %1 %2 com potência %3',
    args0: [
      { type: 'field_dropdown', name: 'LADO', options: [['esquerdo', 'E'], ['direito', 'D']] },
      { type: 'field_dropdown', name: 'SENTIDO', options: [['para frente', 'FRENTE'], ['para trás', 'TRAS'], ['parar', 'PARAR']] },
      { type: 'input_value', name: 'POT', check: 'Number' },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null, colour: C.motor,
    tooltip: 'Ponte H tipo L298N: esquerdo usa pinos 5 (PWM), 7, 8; direito usa 6 (PWM), 9, 10.',
  },
]);

export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Pinos', colour: C.io, contents: [
      { kind: 'block', type: 'arduino_led_embutido' },
      { kind: 'block', type: 'arduino_escrever_digital' },
      { kind: 'block', type: 'arduino_ler_digital' },
      { kind: 'block', type: 'arduino_ler_analogico' },
      { kind: 'block', type: 'arduino_escrever_pwm', inputs: { VALOR: { shadow: { type: 'math_number', fields: { NUM: 128 } } } } },
    ] },
    { kind: 'category', name: 'Tempo', colour: C.tempo, contents: [
      { kind: 'block', type: 'arduino_esperar', inputs: { MS: { shadow: { type: 'math_number', fields: { NUM: 1000 } } } } },
      { kind: 'block', type: 'arduino_millis' },
    ] },
    { kind: 'category', name: 'Controle', colour: '#5b6b7a', contents: [
      { kind: 'block', type: 'controls_if' },
      { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } } },
      { kind: 'block', type: 'controls_whileUntil' },
    ] },
    { kind: 'category', name: 'Lógica', colour: '#4d7c0f', contents: [
      { kind: 'block', type: 'logic_compare' },
      { kind: 'block', type: 'logic_operation' },
      { kind: 'block', type: 'logic_negate' },
      { kind: 'block', type: 'logic_boolean' },
    ] },
    { kind: 'category', name: 'Números', colour: '#0e7490', contents: [
      { kind: 'block', type: 'math_number' },
      { kind: 'block', type: 'math_arithmetic' },
      { kind: 'block', type: 'math_random_int', inputs: {
        FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } } } },
    ] },
    { kind: 'category', name: 'Texto', colour: '#a16207', contents: [{ kind: 'block', type: 'text' }] },
    { kind: 'category', name: 'Variáveis', colour: '#9d174d', custom: 'VARIABLE' },
    { kind: 'category', name: 'Monitor serial', colour: C.serial, contents: [
      { kind: 'block', type: 'arduino_serial_escrever', inputs: { TEXTO: { shadow: { type: 'text', fields: { TEXT: 'Olá!' } } } } },
    ] },
    { kind: 'category', name: 'Carrinho', colour: C.motor, contents: [
      { kind: 'block', type: 'arduino_motor', inputs: { POT: { shadow: { type: 'math_number', fields: { NUM: 200 } } } } },
      { kind: 'block', type: 'arduino_distancia' },
    ] },
  ],
};

export const programaInicial = {
  blocks: { languageVersion: 0, blocks: [{
    type: 'arduino_programa', x: 30, y: 30,
    inputs: { LOOP: { block: {
      type: 'arduino_led_embutido', fields: { ESTADO: 'HIGH' },
      next: { block: { type: 'arduino_esperar', inputs: { MS: { shadow: { type: 'math_number', fields: { NUM: 500 } } } },
        next: { block: { type: 'arduino_led_embutido', fields: { ESTADO: 'LOW' },
          next: { block: { type: 'arduino_esperar', inputs: { MS: { shadow: { type: 'math_number', fields: { NUM: 500 } } } } } } } } } } } } },
  }] },
};
