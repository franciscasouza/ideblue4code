// Gera código C++ do Arduino a partir dos blocos.
import * as Blockly from 'blockly/core';

export const arduino = new Blockly.CodeGenerator('Arduino');
const O = { ATOMIC: 0, UNARY: 2, MULT: 3, ADD: 4, REL: 6, EQ: 7, AND: 11, OR: 12, NONE: 99 };
arduino.ORDER_ATOMIC = O.ATOMIC;
arduino.ORDER_NONE = O.NONE;
arduino.INDENT = '  ';

arduino.init = function (ws) {
  this.includes_ = Object.create(null);
  this.definitions_ = Object.create(null);
  this.setups_ = Object.create(null);
  this.nameDB_ = new Blockly.Names('setup,loop,if,else,for,while,int,float,long,void,return,HIGH,LOW');
  this.nameDB_.setVariableMap(ws.getVariableMap());
  const vars = Blockly.Variables.allUsedVarModels(ws).map(
    (v) => 'float ' + this.nameDB_.getName(v.getId(), Blockly.Names.NameType.VARIABLE) + ' = 0;');
  if (vars.length) this.definitions_['__vars'] = vars.join('\n');
};

arduino.scrub_ = function (block, code, thisOnly) {
  const next = block.nextConnection && block.nextConnection.targetBlock();
  return thisOnly ? code : code + this.blockToCode(next);
};

arduino.finish = function (code) {
  const inc = Object.values(this.includes_).join('\n');
  const defs = Object.values(this.definitions_).join('\n\n');
  this.nameDB_.reset();
  return [inc, defs, code].filter(Boolean).join('\n\n') + '\n';
};

arduino.scrubNakedValue = (line) => line + ';\n';

const pinMode = (g, pino, modo) => { g.setups_['pin_' + pino] = `pinMode(${pino}, ${modo});`; };
const val = (g, b, nome, padrao = '0') => g.valueToCode(b, nome, O.NONE) || padrao;
const F = arduino.forBlock;

F['arduino_programa'] = function (b, g) {
  const setupBody = g.statementToCode(b, 'SETUP');
  const loopBody = g.statementToCode(b, 'LOOP');
  const auto = Object.values(g.setups_).map((s) => g.INDENT + s).join('\n');
  return `void setup() {\n${auto ? auto + '\n' : ''}${setupBody}}\n\nvoid loop() {\n${loopBody}}\n`;
};
F['arduino_escrever_digital'] = (b, g) => {
  const p = b.getFieldValue('PINO'); pinMode(g, p, 'OUTPUT');
  return `digitalWrite(${p}, ${b.getFieldValue('ESTADO')});\n`;
};
F['arduino_led_embutido'] = (b, g) => {
  pinMode(g, 'LED_BUILTIN', 'OUTPUT');
  return `digitalWrite(LED_BUILTIN, ${b.getFieldValue('ESTADO')});\n`;
};
F['arduino_ler_digital'] = (b, g) => {
  const p = b.getFieldValue('PINO'); pinMode(g, p, 'INPUT');
  return [`(digitalRead(${p}) == HIGH)`, O.ATOMIC];
};
F['arduino_ler_analogico'] = (b) => [`analogRead(${b.getFieldValue('PINO')})`, O.ATOMIC];
F['arduino_escrever_pwm'] = (b, g) => {
  const p = b.getFieldValue('PINO'); pinMode(g, p, 'OUTPUT');
  return `analogWrite(${p}, constrain((int)(${val(g, b, 'VALOR')}), 0, 255));\n`;
};
F['arduino_esperar'] = (b, g) => `delay(${val(g, b, 'MS', '1000')});\n`;
F['arduino_millis'] = () => ['millis()', O.ATOMIC];
F['arduino_serial_escrever'] = (b, g) => {
  g.setups_['serial'] = 'Serial.begin(9600);';
  return `Serial.println(${val(g, b, 'TEXTO', '""')});\n`;
};
F['arduino_distancia'] = (b, g) => {
  const t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  pinMode(g, t, 'OUTPUT'); pinMode(g, e, 'INPUT');
  g.definitions_['distancia'] =
`float distanciaCm(int trig, int echo) {
  digitalWrite(trig, LOW); delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long us = pulseIn(echo, HIGH, 30000);
  return us / 58.0;
}`;
  return [`distanciaCm(${t}, ${e})`, O.ATOMIC];
};
F['arduino_motor'] = (b, g) => {
  ['5', '7', '8', '6', '9', '10'].forEach((p) => pinMode(g, p, 'OUTPUT'));
  g.definitions_['motor'] =
`// Ponte H (L298N): esquerdo = EN 5, IN 7/8; direito = EN 6, IN 9/10
void motor(char lado, int sentido, int pot) {
  int en = lado == 'E' ? 5 : 6, a = lado == 'E' ? 7 : 9, b = lado == 'E' ? 8 : 10;
  digitalWrite(a, sentido > 0 ? HIGH : LOW);
  digitalWrite(b, sentido < 0 ? HIGH : LOW);
  analogWrite(en, sentido == 0 ? 0 : constrain(pot, 0, 255));
}`;
  const s = { FRENTE: 1, TRAS: -1, PARAR: 0 }[b.getFieldValue('SENTIDO')];
  return `motor('${b.getFieldValue('LADO')}', ${s}, (int)(${val(g, b, 'POT', '200')}));\n`;
};

// Blocos padrão do Blockly
F['controls_if'] = (b, g) => {
  let code = '', n = 0;
  do {
    code += (n ? ' else ' : '') + `if (${g.valueToCode(b, 'IF' + n, O.NONE) || 'false'}) {\n${g.statementToCode(b, 'DO' + n)}}`;
    n++;
  } while (b.getInput('IF' + n));
  if (b.getInput('ELSE')) code += ` else {\n${g.statementToCode(b, 'ELSE')}}`;
  return code + '\n';
};
F['controls_repeat_ext'] = (b, g) => {
  const v = g.nameDB_.getDistinctName('i', Blockly.Names.NameType.VARIABLE);
  return `for (int ${v} = 0; ${v} < ${val(g, b, 'TIMES', '0')}; ${v}++) {\n${g.statementToCode(b, 'DO')}}\n`;
};
F['controls_whileUntil'] = (b, g) => {
  let c = g.valueToCode(b, 'BOOL', O.NONE) || 'false';
  if (b.getFieldValue('MODE') === 'UNTIL') c = `!(${c})`;
  return `while (${c}) {\n${g.statementToCode(b, 'DO')}}\n`;
};
F['logic_compare'] = (b, g) => {
  const op = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' }[b.getFieldValue('OP')];
  const ord = op === '==' || op === '!=' ? O.EQ : O.REL;
  return [`${g.valueToCode(b, 'A', ord) || '0'} ${op} ${g.valueToCode(b, 'B', ord) || '0'}`, ord];
};
F['logic_operation'] = (b, g) => {
  const and = b.getFieldValue('OP') === 'AND', ord = and ? O.AND : O.OR;
  return [`${g.valueToCode(b, 'A', ord) || 'false'} ${and ? '&&' : '||'} ${g.valueToCode(b, 'B', ord) || 'false'}`, ord];
};
F['logic_negate'] = (b, g) => [`!${g.valueToCode(b, 'BOOL', O.UNARY) || 'true'}`, O.UNARY];
F['logic_boolean'] = (b) => [b.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', O.ATOMIC];
F['math_number'] = (b) => [String(b.getFieldValue('NUM')), O.ATOMIC];
F['math_arithmetic'] = (b, g) => {
  const [op, ord] = { ADD: ['+', O.ADD], MINUS: ['-', O.ADD], MULTIPLY: ['*', O.MULT], DIVIDE: ['/', O.MULT] }[b.getFieldValue('OP')] || [];
  if (!op) return [`pow(${val(g, b, 'A')}, ${val(g, b, 'B')})`, O.ATOMIC];
  return [`${g.valueToCode(b, 'A', ord) || '0'} ${op} ${g.valueToCode(b, 'B', ord + 0.1) || '0'}`, ord];
};
F['math_random_int'] = (b, g) => [`random(${val(g, b, 'FROM')}, (${val(g, b, 'TO')}) + 1)`, O.ATOMIC];
F['text'] = (b) => [JSON.stringify(b.getFieldValue('TEXT')), O.ATOMIC];
F['variables_get'] = (b, g) => [g.getVariableName(b.getFieldValue('VAR')), O.ATOMIC];
F['variables_set'] = (b, g) => `${g.getVariableName(b.getFieldValue('VAR'))} = ${val(g, b, 'VALUE')};\n`;
F['math_change'] = (b, g) => `${g.getVariableName(b.getFieldValue('VAR'))} += ${val(g, b, 'DELTA')};\n`;
