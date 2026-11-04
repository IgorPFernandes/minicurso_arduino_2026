/*
 * Roteiro da aula no datashow: o que aparece a cada clique do instrutor.
 *
 * Cada etapa segue a mesma ordem: demonstração, QR code e, a partir do LED,
 * bancada. Cada tela descreve a placa inteira, em vez de só o que mudou, para
 * voltar e avançar nunca deixar sobra da tela anterior.
 *
 * Os slides do PDF entram antes e depois das etapas na apresentação completa, que
 * é gerada por gerar_apresentacao.py. Sem eles, o roteiro tem só as etapas.
 *
 * Para mudar uma legenda ou uma demonstração, só este arquivo precisa ser editado.
 */
(function (global) {
  'use strict';

  const { ETAPAS } = global;
  const { RESISTOR_PADRAO, TENSAO_LED } = global.Circuito;

  const QUEDA_NO_RESISTOR = 5 - TENSAO_LED;
  const MILIAMPERES = ((QUEDA_NO_RESISTOR / RESISTOR_PADRAO) * 1000).toFixed(1).replace('.', ',');

  const jumper = (cor, a, b) => ({ tipo: 'jumper', cor, a, b });
  const resistor = (a, b) => ({ tipo: 'resistor', a, b });
  const led = (a, b) => ({ tipo: 'led', a, b });

  const ENERGIA = { '5V': 5, GND: 0 };
  const LIGA_5V = jumper('vermelho', '5V', 'E+1');
  const LIGA_GND = jumper('preto', 'GND', 'E-1');

  // Etapa 2: a mesma montagem cresce a cada clique
  const ATE_FILEIRA = jumper('vermelho', 'E+8', 'a8');
  const CRUZA_CANALETA = jumper('vermelho', 'e8', 'f8');

  // Etapa 3: o resistor chega na fileira 5 e o jumper preto sai da fileira 7
  const BASE_LED = [LIGA_5V, LIGA_GND, resistor('E+5', 'c5'), jumper('preto', 'E-7', 'c7')];

  // Etapa 4: o LED já está na placa, falta decidir como a energia chega nele
  const BASE_RESISTOR = [LIGA_5V, LIGA_GND, led('c5', 'c7'), jumper('preto', 'E-7', 'a7')];

  // Etapa 5: a montagem do Blink, peça por peça
  const BLINK_JUMPER = jumper('amarelo', '3', 'a5');
  const BLINK_RESISTOR = resistor('c5', 'c8');
  const BLINK_LED = led('d8', 'd10');
  const BLINK_VOLTA = jumper('preto', 'GND', 'a10');
  const BLINK = { fontes: { ...ENERGIA, 3: 5 }, programa: 'blink' };

  const DEMONSTRACOES = {
    // A etapa 1 mostra a mesma animação do celular, mas no ritmo do instrutor.
    1: ETAPAS[0].cenas[0].quadros,

    2: [
      {
        texto: 'O Arduino não encosta na protoboard. Quem leva a energia até ela é o jumper.',
        pecas: [],
        raiox: true,
      },
      {
        texto: '5V no trilho +. Um furo basta: o trilho inteiro fica com 5V.',
        pecas: [LIGA_5V],
        raiox: true,
      },
      {
        texto: 'GND no trilho −. É por aqui que a corrente volta.',
        pecas: [LIGA_5V, LIGA_GND],
        raiox: true,
      },
      {
        texto: 'Outro jumper leva os 5V até a fileira que eu precisar.',
        pecas: [LIGA_5V, LIGA_GND, ATE_FILEIRA],
        raiox: true,
      },
      {
        texto: 'A canaleta corta a ligação. Para passar para o outro lado, só com jumper.',
        pecas: [LIGA_5V, LIGA_GND, ATE_FILEIRA, CRUZA_CANALETA],
        raiox: true,
      },
    ].map((tela) => ({ ...tela, fontes: ENERGIA })),

    3: [
      {
        texto: 'O resistor traz a corrente até a fileira 5. O jumper preto da fileira 7 volta para o GND.',
        pecas: BASE_LED,
      },
      {
        texto: 'O LED fica entre as duas fileiras, com a perna longa do lado do 5V.',
        pecas: [...BASE_LED, led('d5', 'd7')],
      },
      {
        texto: 'Invertido, não acende: o LED só deixa a corrente passar da perna longa para a curta.',
        pecas: [...BASE_LED, led('d7', 'd5')],
      },
      {
        texto: 'Com as duas pernas na mesma fileira, o metal liga as pernas e o LED fica apagado.',
        pecas: [...BASE_LED, led('b5', 'd5')],
      },
    ].map((tela) => ({ ...tela, fontes: ENERGIA })),

    4: [
      {
        texto: 'O LED já está ligado ao GND. Falta a energia chegar na fileira 5.',
        pecas: BASE_RESISTOR,
      },
      {
        texto: 'Direto no 5V, sem resistor, a corrente passa do limite e o LED queima. Na bancada, não faça isso.',
        pecas: [...BASE_RESISTOR, jumper('vermelho', 'E+5', 'a5')],
      },
      {
        texto: `Com o resistor no caminho, a corrente fica em cerca de ${MILIAMPERES} mA: (5 V − ${TENSAO_LED} V) ÷ ${RESISTOR_PADRAO} Ω.`,
        pecas: [...BASE_RESISTOR, resistor('E+5', 'a5')],
      },
    ].map((tela) => ({ ...tela, fontes: ENERGIA })),

    5: [
      {
        texto: 'No Blink, quem manda é o código: a corrente sai do pino ~3.',
        pecas: [BLINK_JUMPER],
      },
      {
        texto: 'Da fileira 5, o resistor leva a corrente até a fileira 8.',
        pecas: [BLINK_JUMPER, BLINK_RESISTOR],
      },
      {
        texto: 'O LED fica entre as fileiras 8 e 10, com a perna longa do lado do resistor.',
        pecas: [BLINK_JUMPER, BLINK_RESISTOR, BLINK_LED],
      },
      {
        texto: 'O jumper preto fecha o caminho até o GND. Quando o código liga o pino, o LED acende.',
        pecas: [BLINK_JUMPER, BLINK_RESISTOR, BLINK_LED, BLINK_VOLTA],
      },
    ].map((tela) => ({ ...tela, ...BLINK })),
  };

  const TELAS_DAS_ETAPAS = ETAPAS.flatMap((etapa) => [
    ...DEMONSTRACOES[etapa.n].map((tela) => ({ ...tela, tipo: 'demo', etapa })),
    { tipo: 'qr', etapa },
    ...(etapa.bancada ? [{ tipo: 'bancada', etapa }] : []),
  ]);

  // As etapas entram antes do Projeto I. São 6 slides antes delas: os 5 primeiros
  // do PDF mais o slide pessoal, que vem logo depois da capa.
  const SLIDES_ANTES_DAS_ETAPAS = 6;
  const SLIDES = (global.SLIDES || []).map((src, i) => ({ tipo: 'slide', src, numero: i + 1 }));

  global.ROTEIRO = [
    ...SLIDES.slice(0, SLIDES_ANTES_DAS_ETAPAS),
    ...TELAS_DAS_ETAPAS,
    ...SLIDES.slice(SLIDES_ANTES_DAS_ETAPAS),
  ];
})(window);
