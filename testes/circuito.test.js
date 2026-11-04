/*
 * Confere se o simulador ensina eletrônica certa.
 * Rode com: node testes/circuito.test.js
 */
const assert = require('node:assert/strict');
const {
  faixaDe,
  furosDaFaixa,
  todosOsFuros,
  resolver,
  analisar,
  caminhoDaCorrente,
  CORRENTE_MIN,
} = require('../circuito.js');

const ENERGIA = { '5V': 5, GND: 0 };
let id = 0;
const jumper = (a, b) => ({ id: 'j' + ++id, tipo: 'jumper', a, b });
const resistor = (a, b) => ({ id: 'r' + ++id, tipo: 'resistor', a, b });
const led = (a, b) => ({ id: 'l' + ++id, tipo: 'led', a, b });

// Base da etapa 3: 5V no trilho +, GND no trilho −, resistor até a fileira 5
// e jumper de volta pela fileira 7.
const base = () => [
  jumper('5V', 'E+1'),
  jumper('GND', 'E-1'),
  resistor('E+5', 'c5'),
  jumper('E-7', 'c7'),
];

let total = 0;
function teste(nome, fn) {
  total++;
  try {
    fn();
    console.log('  ok   ' + nome);
  } catch (e) {
    console.log('  FALHOU ' + nome);
    throw e;
  }
}

console.log('Placa');
teste('a placa tem 168 furos (120 + 4 trilhos de 12)', () => {
  assert.equal(new Set(todosOsFuros()).size, 168);
});
teste('furos da mesma fileira e do mesmo lado estão ligados', () => {
  assert.equal(faixaDe('a7'), faixaDe('e7'));
  assert.equal(faixaDe('f7'), faixaDe('j7'));
});
teste('a canaleta separa os dois lados', () => {
  assert.notEqual(faixaDe('e7'), faixaDe('f7'));
});
teste('colunas não são ligadas', () => {
  assert.notEqual(faixaDe('c7'), faixaDe('c8'));
});
teste('o trilho corre pela placa inteira', () => {
  assert.equal(faixaDe('E+1'), faixaDe('E+12'));
  assert.equal(furosDaFaixa('E+').length, 12);
});
teste('os trilhos não se tocam entre si', () => {
  assert.notEqual(faixaDe('E+1'), faixaDe('E-1'));
  assert.notEqual(faixaDe('E+1'), faixaDe('D+1'));
});

console.log('LED e resistor');
teste('montagem correta acende com 13,6 mA', () => {
  const l = led('d5', 'd7');
  const d = analisar([...base(), l], ENERGIA);
  assert.equal(d.codigo, 'aceso');
  assert.ok(Math.abs(d.i - 3 / 221) < 1e-6, 'corrente ' + d.i);
});
teste('funciona em qualquer furo da mesma fileira', () => {
  assert.equal(analisar([...base(), led('a5', 'e7')], ENERGIA).codigo, 'aceso');
});
teste('LED invertido não acende e é identificado', () => {
  assert.equal(analisar([...base(), led('d7', 'd5')], ENERGIA).codigo, 'invertido');
});
teste('duas pernas na mesma fileira são identificadas', () => {
  assert.equal(analisar([...base(), led('b5', 'd5')], ENERGIA).codigo, 'mesma-fileira');
});
teste('LED direto no 5V, sem resistor, queima', () => {
  const pecas = [jumper('5V', 'E+1'), jumper('GND', 'E-1'), jumper('E+5', 'a5'), led('c5', 'c7'), jumper('E-7', 'a7')];
  assert.equal(analisar(pecas, ENERGIA).codigo, 'queimou');
});
teste('resistor com as duas pernas na mesma fileira não protege', () => {
  const pecas = [
    jumper('5V', 'E+1'),
    jumper('GND', 'E-1'),
    jumper('E+5', 'a5'),
    resistor('b5', 'e5'),
    led('c5', 'c7'),
    jumper('E-7', 'a7'),
  ];
  const d = analisar(pecas, ENERGIA);
  assert.equal(d.codigo, 'queimou');
  assert.equal(d.resistorIgnorado, true);
});
teste('a ordem não importa: resistor depois do LED dá a mesma corrente', () => {
  const pecas = [
    jumper('5V', 'E+1'),
    jumper('GND', 'E-1'),
    jumper('E+5', 'a5'),
    led('c5', 'c7'),
    resistor('a7', 'E-7'),
  ];
  const d = analisar(pecas, ENERGIA);
  assert.equal(d.codigo, 'aceso');
  assert.ok(Math.abs(d.i - 3 / 221) < 1e-6);
});
teste('o trilho leva a energia até o outro extremo da placa', () => {
  const pecas = [jumper('5V', 'E+12'), jumper('GND', 'E-12'), resistor('E+1', 'c1'), led('d1', 'd3'), jumper('E-3', 'c3')];
  assert.equal(analisar(pecas, ENERGIA).codigo, 'aceso');
});
teste('fio em paralelo com o LED: o LED apaga e a corrente desvia', () => {
  const l = led('d5', 'd7');
  const pecas = [...base(), l, jumper('e5', 'e7')];
  const res = resolver(pecas, ENERGIA);
  assert.equal(res.correntes.get(l.id), 0);
  const r = pecas.find((p) => p.tipo === 'resistor');
  assert.ok(Math.abs(res.correntes.get(r.id) - 5 / 220) < 1e-6);
});

console.log('Dicas de circuito aberto');
teste('jumper no lado errado da canaleta', () => {
  const pecas = [
    jumper('5V', 'E+1'),
    jumper('GND', 'E-1'),
    resistor('E+5', 'c5'),
    led('d5', 'd7'),
    jumper('E-7', 'f7'), // devia estar de a até e
  ];
  const d = analisar(pecas, ENERGIA);
  assert.equal(d.codigo, 'aberto');
  assert.equal(d.falta.motivo, 'canaleta');
});
teste('jumper uma fileira ao lado', () => {
  const pecas = [
    jumper('5V', 'E+1'),
    jumper('GND', 'E-1'),
    resistor('E+5', 'c5'),
    led('d5', 'd7'),
    jumper('E-8', 'c8'), // devia estar na fileira 7
  ];
  const d = analisar(pecas, ENERGIA);
  assert.equal(d.codigo, 'aberto');
  assert.equal(d.falta.motivo, 'vizinha');
});
teste('faltando o GND no trilho', () => {
  const pecas = [jumper('5V', 'E+1'), resistor('E+5', 'c5'), led('d5', 'd7'), jumper('E-7', 'c7')];
  const d = analisar(pecas, ENERGIA);
  assert.equal(d.codigo, 'aberto');
  assert.ok(d.falta, 'deveria dizer o que falta');
});
teste('trilhos da esquerda e da direita não se ajudam', () => {
  const pecas = [
    jumper('5V', 'E+1'),
    jumper('GND', 'E-1'),
    resistor('D+5', 'h5'),
    led('g5', 'g7'),
    jumper('D-7', 'h7'),
  ];
  assert.equal(analisar(pecas, ENERGIA).codigo, 'aberto');
});

console.log('Curto-circuito');
teste('5V e GND no mesmo trilho', () => {
  const pecas = [jumper('5V', 'E+1'), jumper('GND', 'E+2')];
  assert.equal(analisar(pecas, ENERGIA).codigo, 'curto');
});
teste('jumper ligando os trilhos + e −', () => {
  const pecas = [jumper('5V', 'E+1'), jumper('GND', 'E-1'), jumper('E+5', 'E-5')];
  assert.equal(analisar(pecas, ENERGIA).codigo, 'curto');
});

console.log('Blink (pino 3)');
const montagemBlink = () => [jumper('3', 'a5'), resistor('c5', 'c8'), led('d8', 'd10'), jumper('GND', 'a10')];
teste('com o pino em HIGH o LED acende', () => {
  assert.equal(analisar(montagemBlink(), { ...ENERGIA, 3: 5 }).codigo, 'aceso');
});
teste('com o pino em LOW o LED apaga sem dar curto', () => {
  const d = analisar(montagemBlink(), { ...ENERGIA, 3: 0 });
  assert.notEqual(d.codigo, 'aceso');
  assert.notEqual(d.codigo, 'curto');
});
teste('pino 3 ligado direto no GND dá curto quando vai para HIGH', () => {
  const pecas = [jumper('3', 'a5'), jumper('GND', 'b5')];
  assert.equal(analisar(pecas, { ...ENERGIA, 3: 5 }).codigo, 'curto');
});

const BLINK = { ...ENERGIA, 3: 5 };
const restoCerto = () => [jumper('GND', 'E-1'), jumper('E-7', 'a7'), resistor('e5', 'f5'), led('d5', 'd7')];
const pontos = (d) => [d.falta.a, d.falta.b];

teste('pino ~3 vazio: a dica aponta o pino e a tira do resistor', () => {
  // Montagem real de um teste do instrutor: jumper amarelo só entre j5 e o trilho.
  const pecas = [jumper('j5', 'D+5'), ...restoCerto()];
  const d = analisar(pecas, BLINK, { pinoDoPrograma: '3' });
  assert.equal(d.codigo, 'aberto');
  assert.deepEqual(pontos(d).sort(), ['3', 'f5']);
});
teste('jumper no 5V por engano: a dica não sugere ligar no 5V', () => {
  const pecas = [jumper('5V', 'a1'), ...restoCerto()];
  const d = analisar(pecas, BLINK, { pinoDoPrograma: '3' });
  assert.equal(d.codigo, 'aberto');
  assert.ok(pontos(d).includes('3'), 'apontou ' + pontos(d));
});

console.log('Caminho da corrente');
teste('passa por todos os pontos, na ordem certa', () => {
  const pecas = [...base(), led('d5', 'd7')];
  const fontes = ENERGIA;
  const passos = caminhoDaCorrente(pecas, resolver(pecas, fontes), fontes);
  const pontos = [passos[0].de, ...passos.map((s) => s.para)];
  assert.deepEqual(pontos, ['5V', 'E+1', 'E+5', 'c5', 'd5', 'd7', 'c7', 'E-7', 'E-1', 'GND']);
});
teste('sem caminho fechado não há corrente para desenhar', () => {
  const pecas = [jumper('5V', 'E+1'), resistor('E+5', 'c5'), led('d5', 'd7')];
  assert.equal(caminhoDaCorrente(pecas, resolver(pecas, ENERGIA), ENERGIA), null);
});
teste('LED em curto: a corrente desvia pela tira e não passa nele', () => {
  const l = led('b5', 'd5');
  const pecas = [jumper('5V', 'E+1'), jumper('GND', 'E-1'), resistor('E+5', 'c5'), l, jumper('E-7', 'a7'), jumper('e5', 'e7')];
  const passos = caminhoDaCorrente(pecas, resolver(pecas, ENERGIA), ENERGIA);
  assert.ok(passos && !passos.some((s) => s.via === l));
  assert.ok(CORRENTE_MIN > 0);
});

console.log(`\n${total} testes passaram.`);
