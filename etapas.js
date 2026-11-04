/*
 * Conteúdo das mini-etapas. Para mudar um texto, ou criar uma etapa nova,
 * só este arquivo precisa ser editado.
 *
 * Cada etapa tem cenas, de três tipos:
 *   animacao: passa sozinha, quadro a quadro, sem precisar tocar na tela
 *   quiz:     responde sem ver as tiras de metal
 *   montagem: coloca as peças; os objetivos são conferidos pelo circuito,
 *             nunca por furos fixos
 *
 * O campo bancada é opcional e só começa na etapa do LED: como não há multímetro
 * para todos, é o LED aceso que mostra ao aluno que a montagem deu certo.
 */
(function (global) {
  'use strict';

  const { faixaDe, todasAsFaixas, TRILHOS, RESISTOR_PADRAO, TENSAO_LED } = global.Circuito;

  // Endereço público do site, usado nos QR codes da aula no datashow.
  global.ENDERECO_DO_SITE = 'https://igorpfernandes.github.io/minicurso_arduino_2026/';

  const ENERGIA = { '5V': 5, GND: 0 };
  const FILEIRAS_TODAS = todasAsFaixas().filter((f) => /^(esq|dir)/.test(f));
  const JUMPER_5V = { tipo: 'jumper', cor: 'vermelho', a: '5V', b: 'E+1' };
  const JUMPER_GND = { tipo: 'jumper', cor: 'preto', a: 'GND', b: 'E-1' };
  const miliamperes = (i) => (i * 1000).toFixed(1).replace('.', ',');
  const contaDaCorrente = (i) =>
    `I = (5 V − ${TENSAO_LED} V) ÷ ${RESISTOR_PADRAO} Ω ≈ ${miliamperes(i)} mA`;

  /* ---------- Perguntas sem raio-X ---------- */

  const sortear = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const umaDe = (texto) => texto[sortear(0, texto.length - 1)];

  const PERGUNTAS = {
    'toque-fileira'() {
      const lado = Math.random() < 0.5 ? 'abcde' : 'fghij';
      const n = sortear(2, 11);
      const furo = umaDe(lado) + n;
      return {
        marcas: [furo],
        texto: `Toque em outro furo ligado ao ${furo}.`,
        toque: true,
        confere: (f) => f !== furo && faixaDe(f) === faixaDe(furo),
        certo: `Isso. A tira liga de ${lado[0]} até ${lado[4]} na fileira ${n}.`,
        errado: `A tira do ${furo} só liga os furos de ${lado[0]} até ${lado[4]} da fileira ${n}.`,
      };
    },
    colunas() {
      const coluna = umaDe('abcdefghij');
      const n = sortear(2, 10);
      return {
        marcas: [coluna + n, coluna + (n + 1)],
        texto: `${coluna}${n} e ${coluna}${n + 1} estão ligados?`,
        resposta: false,
        certo: `Não estão. A fileira ${n} e a ${n + 1} são tiras separadas.`,
        errado: `Não estão. A ligação corre ao longo da fileira, não da coluna: a ${n} e a ${n + 1} são tiras separadas.`,
      };
    },
    canaleta() {
      const n = sortear(2, 11);
      return {
        marcas: ['e' + n, 'f' + n],
        texto: `e${n} e f${n} estão ligados?`,
        resposta: false,
        certo: 'Não estão. A canaleta central separa os dois lados.',
        errado: 'Não estão. Mesmo na mesma fileira, a canaleta central corta a ligação entre e e f.',
      };
    },
    'mesma-fileira'() {
      const n = sortear(2, 11);
      const [a, b] = Math.random() < 0.5 ? ['a', 'd'] : ['g', 'j'];
      return {
        marcas: [a + n, b + n],
        texto: `${a}${n} e ${b}${n} estão ligados?`,
        resposta: true,
        certo: 'Estão. Mesma fileira e mesmo lado: é a mesma tira de metal.',
        errado: 'Estão. Mesma fileira e mesmo lado da canaleta: é a mesma tira de metal.',
      };
    },
    'toque-trilho'() {
      const trilho = umaDe(['E+', 'E-', 'D+', 'D-']);
      const furo = trilho + sortear(3, 10);
      const nome = trilho[1] === '+' ? '+' : '−';
      return {
        marcas: [furo],
        texto: `Toque em outro furo ligado a este do trilho ${nome}.`,
        toque: true,
        confere: (f) => f !== furo && faixaDe(f) === faixaDe(furo),
        certo: 'Isso. O trilho é uma tira única, de ponta a ponta da placa.',
        errado: 'Os trilhos correm no sentido da placa: todos os furos da mesma linha colorida estão ligados.',
      };
    },
    'trilhos-lados'() {
      const n = sortear(3, 10);
      return {
        marcas: ['E+' + n, 'D+' + n],
        texto: 'Os dois furos marcados, um em cada trilho +, estão ligados?',
        resposta: false,
        certo: 'Não estão. Cada lado tem seus próprios trilhos.',
        errado: 'Não estão. Os trilhos da esquerda e da direita não se tocam. Para usar os dois, ligue um no outro com um jumper.',
      };
    },
  };

  /* ---------- Etapas ---------- */

  const ETAPAS = [
    {
      n: 1,
      titulo: 'Por dentro da protoboard',
      resumo: 'Veja por onde a corrente anda dentro da placa.',
      cenas: [
        {
          tipo: 'animacao',
          quadros: [
            {
              texto: 'Por fora, parecem furos soltos. Por baixo do plástico, tiras de metal ligam esses furos.',
              ms: 4500,
              revelarEm: 1800,
            },
            {
              texto: 'A corrente entra por um furo e corre ao longo da tira até sair por outro.',
              ms: 5500,
              faixas: ['esq5'],
              rotulos: true,
            },
            {
              texto: 'A canaleta corta o metal: de a até e é uma tira, de f até j é outra.',
              ms: 5500,
              faixas: ['esq5', 'dir5'],
              canaleta: true,
            },
            {
              texto: 'Cada fileira é uma tira própria. A corrente não pula para a fileira de cima nem para a de baixo.',
              ms: 6000,
              faixas: FILEIRAS_TODAS,
            },
            {
              texto: 'Os trilhos são diferentes: uma tira só, de ponta a ponta da placa.',
              ms: 5500,
              faixas: TRILHOS,
            },
            {
              texto: 'Esse é o mapa da protoboard. Agora tente sem ver o metal.',
              faixas: [...FILEIRAS_TODAS, ...TRILHOS],
            },
          ],
          botao: 'Testar sem o raio-X',
        },
        {
          tipo: 'quiz',
          texto: 'Agora sem raio-X. Olhe os furos marcados e responda.',
          perguntas: ['toque-fileira', 'colunas', 'canaleta', 'mesma-fileira', 'toque-trilho', 'trilhos-lados'],
        },
      ],
    },

    {
      n: 2,
      titulo: 'Jumper: levando a energia',
      resumo: 'Tire o 5V e o GND do Arduino e leve até a fileira que precisar.',
      cenas: [
        {
          tipo: 'montagem',
          raiox: true,
          ordem: true,
          fontes: ENERGIA,
          bandeja: [
            { tipo: 'jumper', cor: 'vermelho' },
            { tipo: 'jumper', cor: 'preto' },
            { tipo: 'jumper', cor: 'vermelho' },
            { tipo: 'jumper', cor: 'vermelho' },
          ],
          objetivos: [
            {
              id: '5v',
              texto: 'Ligue o pino 5V do Arduino a qualquer furo do trilho +.',
              teste: (c) => c.ligado('5V', 'E+1') || c.ligado('5V', 'D+1'),
              ok: 'Um jumper, um furo, e o trilho + inteiro ficou com 5V.',
            },
            {
              id: 'gnd',
              texto: 'Ligue o pino GND do Arduino a qualquer furo do trilho −.',
              teste: (c) => c.ligado('GND', 'E-1') || c.ligado('GND', 'D-1'),
              ok: 'O trilho − virou o GND. Toda corrente que sair do 5V precisa voltar por aqui.',
            },
            {
              id: 'fileira',
              texto: 'Leve os 5V do trilho + até a fileira 8, em qualquer furo de a até e.',
              teste: (c) => c.ligado('5V', 'a8'),
              ok: 'Bastou um furo: toda a tira da fileira 8 ficou com 5V.',
            },
            {
              id: 'canaleta',
              texto: 'Agora faça a fileira 8 do outro lado da canaleta (f até j) também ter 5V.',
              teste: (c) => c.ligado('5V', 'f8'),
              ok: 'A canaleta corta a ligação, então só um jumper consegue atravessar.',
            },
          ],
          aviso: (c) => {
            if (c.ligado('5V', 'E-1') || c.ligado('5V', 'D-1')) {
              return 'Esse é o trilho −, marcado de azul. O combinado é 5V no + e GND no −, para ninguém se confundir depois.';
            }
            if (c.ligado('GND', 'E+1') || c.ligado('GND', 'D+1')) {
              return 'Esse é o trilho +, marcado de vermelho. O combinado é GND no − e 5V no +.';
            }
            return null;
          },
        },
      ],
    },

    {
      n: 3,
      titulo: 'LED: tem lado certo',
      resumo: 'Provoque os três casos e veja por que um LED não acende.',
      cenas: [
        {
          tipo: 'montagem',
          texto: 'Coloque o LED entre as fileiras 5 e 7 e provoque os 3 casos:',
          fontes: ENERGIA,
          fixas: [
            JUMPER_5V,
            JUMPER_GND,
            { tipo: 'resistor', a: 'E+5', b: 'c5' },
            { tipo: 'jumper', cor: 'preto', a: 'E-7', b: 'c7' },
          ],
          bandeja: [{ tipo: 'led' }],
          objetivos: [
            {
              id: 'aceso',
              rotulo: 'Aceso',
              teste: (c) => c.diag.codigo === 'aceso',
              ok: 'Acendeu. A corrente entra pela perna longa (+) e sai pela curta (−).',
            },
            {
              id: 'invertido',
              rotulo: 'Invertido',
              teste: (c) => c.diag.codigo === 'invertido',
              ok: 'Invertido, não acende. O LED só deixa a corrente passar da perna longa para a curta.',
            },
            {
              id: 'mesma',
              rotulo: 'Mesma fileira',
              teste: (c) => c.diag.codigo === 'mesma-fileira',
              ok: 'A tira de metal liga as duas pernas, então a corrente não precisa atravessar o LED. Ele fica apagado.',
            },
          ],
          fim: 'Agora você sabe diagnosticar um LED apagado. O LED sempre fica entre duas fileiras, com a perna longa do lado do 5V.',
        },
      ],
      bancada: {
        titulo: 'Agora vamos para a bancada',
        itens: [
          'Deixe a protoboard em pé, com a fileira 1 em cima, igual à da tela. Ela é maior, mas funciona do mesmo jeito.',
          'Com o USB desconectado, ligue o 5V ao trilho + e o GND ao trilho −.',
          `Ligue o resistor de ${RESISTOR_PADRAO} Ω (listras vermelho, vermelho, marrom e dourado) do trilho + até a fileira 5.`,
          'Coloque o LED com a perna longa na fileira 5 e a curta na fileira 7. Do lado da perna curta, a borda do LED é reta.',
          'Ligue a fileira 7 ao trilho − com um jumper.',
          'Conecte o USB. LED aceso: deu certo! Apagado: veja se ele não está invertido e se cada ligação está na fileira certa.',
        ],
      },
    },

    {
      n: 4,
      titulo: 'Resistor: quem protege o LED',
      resumo: 'Queime um LED aqui, para não queimar um de verdade.',
      cenas: [
        {
          tipo: 'montagem',
          ordem: true,
          fontes: ENERGIA,
          fixas: [
            JUMPER_5V,
            JUMPER_GND,
            { tipo: 'led', a: 'c5', b: 'c7' },
            { tipo: 'jumper', cor: 'preto', a: 'E-7', b: 'a7' },
          ],
          bandeja: [{ tipo: 'jumper', cor: 'vermelho' }],
          objetivos: [
            {
              id: 'queimar',
              texto: 'Só no simulador: ligue o trilho + direto na fileira 5 com o jumper vermelho.',
              teste: (c) => c.queimou,
              tom: 'erro',
              ok: 'Sem nada para limitar, a corrente passou muito do limite do LED, que é de cerca de 30 mA.',
            },
          ],
          botao: 'Trocar o LED e tentar de novo',
        },
        {
          tipo: 'montagem',
          ordem: true,
          fontes: ENERGIA,
          fixas: [
            JUMPER_5V,
            JUMPER_GND,
            { tipo: 'led', a: 'c5', b: 'c7' },
            { tipo: 'jumper', cor: 'preto', a: 'E-7', b: 'a7' },
          ],
          bandeja: [{ tipo: 'resistor' }],
          objetivos: [
            {
              id: 'proteger',
              texto: 'Agora faça o mesmo caminho pelo resistor: uma perna no trilho +, a outra na fileira 5.',
              teste: (c) => c.diag.codigo === 'aceso',
              ok: (c) => `O resistor segura a corrente. ${contaDaCorrente(c.diag.i)}.`,
            },
          ],
          fim: 'Resistor e LED ficam em fila, um depois do outro. Tanto faz qual vem primeiro: a corrente é a mesma.',
        },
      ],
      bancada: {
        titulo: 'Na sua bancada',
        itens: [
          `Olhe as listras do seu resistor: vermelho, vermelho, marrom e dourado indicam ${RESISTOR_PADRAO} Ω.`,
          'Desconecte o USB, inverta as pernas do resistor e conecte de novo. O LED continua aceso: o resistor não tem lado certo.',
          'Regra da bancada: LED nunca sem resistor.',
        ],
      },
    },

    {
      n: 5,
      titulo: 'Montagem completa: Blink',
      resumo: 'Monte sozinho e faça o código piscar o LED.',
      cenas: [
        {
          tipo: 'montagem',
          ordem: true,
          programa: 'blink',
          fontes: { ...ENERGIA, 3: 5 },
          bandeja: [
            { tipo: 'jumper', cor: 'amarelo' },
            { tipo: 'jumper', cor: 'preto' },
            { tipo: 'jumper', cor: 'preto', reserva: true }, // para quem quiser usar o trilho −
            { tipo: 'resistor' },
            { tipo: 'led' },
          ],
          objetivos: [
            {
              id: 'blink',
              texto: 'O Blink já está rodando. Monte do seu jeito: pino ~3 → resistor → LED → GND.',
              teste: (c) => c.pisca,
              ok: 'Está piscando. O código liga e desliga o pino ~3, e a corrente segue pelo caminho que você montou.',
            },
          ],
          aviso: (c) =>
            c.fixoNo5V
              ? 'O LED acendeu, mas não pisca: ele está preso no 5V, que nunca desliga. Para o código mandar, a corrente precisa sair do pino ~3.'
              : null,
        },
      ],
      bancada: {
        titulo: 'Agora é na bancada',
        montagem: true,
        itens: [
          'Com o USB desconectado, desmonte o circuito anterior e repita a sua montagem.',
          'Confira o caminho com o dedo: pino ~3, resistor, LED, GND.',
          'Conecte o USB e carregue o Blink builtin+ledprotoboard.ino.',
          'Não acendeu? Veja a perna longa do LED e se cada ligação está na mesma fileira.',
        ],
      },
    },
  ];

  global.ETAPAS = ETAPAS;
  global.PERGUNTAS = PERGUNTAS;
})(typeof window !== 'undefined' ? window : globalThis);
