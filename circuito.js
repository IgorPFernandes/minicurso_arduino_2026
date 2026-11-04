/*
 * Protoboard e circuito: só a lógica, sem nada de tela.
 *
 * O circuito é calculado de verdade (análise nodal), em vez de comparar a
 * montagem com um gabarito. Por isso qualquer montagem correta funciona, em
 * qualquer furo, e cada erro pode receber a explicação certa.
 *
 * Testes: node testes/circuito.test.js
 */
(function (global) {
  'use strict';

  const FILEIRAS = 12;
  const COLUNAS = 'abcdefghij'.split('');
  const TRILHOS = ['E+', 'E-', 'D+', 'D-']; // E = esquerda, D = direita
  const PINOS = ['5V', 'GND', '3'];

  // Valores usados nas contas. Se o minicurso usar outro resistor, mude aqui
  // e nas listras em app.js.
  const RESISTOR_PADRAO = 220; // ohm
  const TENSAO_LED = 2.0; // queda de tensão típica de um LED vermelho (V)
  const RESISTENCIA_LED = 1; // resistência interna do LED (ohm)
  const CORRENTE_MAX = 0.03; // acima de 30 mA o LED queima
  const CORRENTE_MIN = 1e-4; // abaixo de 0,1 mA o LED fica apagado

  const ehPino = (id) => PINOS.includes(id);
  const ehTrilho = (id) => /^[ED][+-]/.test(id);

  /* ---------- Geometria da placa ---------- */

  // Faixa = o grupo de furos ligados pela mesma tira de metal.
  function faixaDe(id) {
    if (ehPino(id)) return 'pino' + id;
    if (ehTrilho(id)) return id.slice(0, 2);
    const coluna = id[0];
    const fileira = id.slice(1);
    return ('abcde'.includes(coluna) ? 'esq' : 'dir') + fileira;
  }

  function furosDaFaixa(faixa) {
    if (faixa.startsWith('pino')) return [faixa.slice(4)];
    const numeros = Array.from({ length: FILEIRAS }, (_, i) => i + 1);
    if (TRILHOS.includes(faixa)) return numeros.map((n) => faixa + n);
    const colunas = faixa.startsWith('esq') ? 'abcde' : 'fghij';
    return colunas.split('').map((c) => c + faixa.slice(3));
  }

  function todasAsFaixas() {
    const faixas = [...TRILHOS];
    for (let n = 1; n <= FILEIRAS; n++) faixas.push('esq' + n, 'dir' + n);
    return faixas;
  }

  const todosOsFuros = () => todasAsFaixas().flatMap(furosDaFaixa);

  function nomeDoFuro(id) {
    if (ehPino(id)) return 'pino ' + (id === '3' ? '~3' : id); // como está impresso na placa
    if (ehTrilho(id)) {
      const sinal = id[1] === '+' ? '+' : '−';
      return `trilho ${sinal} da ${id[0] === 'E' ? 'esquerda' : 'direita'}`;
    }
    return id;
  }

  const fileiraDe = (id) => (/^[a-j]\d+$/.test(id) ? Number(id.slice(1)) : null);
  const ladoDe = (id) => ('abcde'.includes(id[0]) ? 'esq' : 'dir');

  /* ---------- Cálculo do circuito ---------- */

  const completa = (p) => Boolean(p.a && p.b);

  function resolverSistema(G, n) {
    for (let i = 0; i < n; i++) {
      let maior = i;
      for (let l = i + 1; l < n; l++) {
        if (Math.abs(G[l][i]) > Math.abs(G[maior][i])) maior = l;
      }
      [G[i], G[maior]] = [G[maior], G[i]];
      for (let l = i + 1; l < n; l++) {
        const fator = G[l][i] / G[i][i];
        for (let c = i; c <= n; c++) G[l][c] -= fator * G[i][c];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let soma = G[i][n];
      for (let c = i + 1; c < n; c++) soma -= G[i][c] * x[c];
      x[i] = soma / G[i][i];
    }
    return x;
  }

  /*
   * pecas: [{ id, tipo: 'jumper'|'resistor'|'led', a, b, queimado }]
   *        No LED, a é a perna longa (+) e b a perna curta (−).
   * fontes: tensão de cada pino que está ativo, por exemplo { '5V': 5, GND: 0 }.
   */
  function resolver(pecas, fontes) {
    // 1. Tudo que o metal e os jumpers ligam vira um ponto só (uma "rede").
    const pai = new Map();
    const raiz = (x) => {
      if (!pai.has(x)) pai.set(x, x);
      while (pai.get(x) !== x) {
        pai.set(x, pai.get(pai.get(x)));
        x = pai.get(x);
      }
      return x;
    };
    pecas
      .filter((p) => p.tipo === 'jumper' && completa(p))
      .forEach((p) => pai.set(raiz(faixaDe(p.a)), raiz(faixaDe(p.b))));
    const rede = (id) => raiz(faixaDe(id));

    // 2. Pinos do Arduino fixam a tensão da sua rede.
    const fixas = new Map();
    const curtos = [];
    Object.entries(fontes).forEach(([pino, v]) => {
      const r = rede(pino);
      if (!fixas.has(r)) fixas.set(r, { pino, v });
      else if (fixas.get(r).v !== v) curtos.push([fixas.get(r).pino, pino]);
    });

    // 3. Uma incógnita para cada rede que tem peça e não tem tensão fixa.
    const componentes = pecas.filter(
      (p) => (p.tipo === 'resistor' || p.tipo === 'led') && completa(p) && !p.queimado
    );
    const indice = new Map();
    componentes.forEach((p) => {
      [p.a, p.b].forEach((f) => {
        const r = rede(f);
        if (!fixas.has(r) && !indice.has(r)) indice.set(r, indice.size);
      });
    });
    const n = indice.size;
    const leds = componentes.filter((p) => p.tipo === 'led');
    const conduzindo = new Map(leds.map((p) => [p.id, true]));

    let x = [];
    const tensaoDaRede = (r) => (fixas.has(r) ? fixas.get(r).v : x[indice.get(r)]);

    function calcular() {
      const G = Array.from({ length: n }, () => new Array(n + 1).fill(0));
      for (let i = 0; i < n; i++) G[i][i] = 1e-9; // evita rede solta sem solução

      // Corrente de a para b: g × (Va − Vb − vs)
      const adicionar = (ra, rb, g, vs) => {
        if (ra === rb) return;
        const ia = indice.get(ra);
        const ib = indice.get(rb);
        if (ia !== undefined) {
          G[ia][ia] += g;
          G[ia][n] += g * vs;
          if (ib !== undefined) G[ia][ib] -= g;
          else G[ia][n] += g * fixas.get(rb).v;
        }
        if (ib !== undefined) {
          G[ib][ib] += g;
          G[ib][n] -= g * vs;
          if (ia !== undefined) G[ib][ia] -= g;
          else G[ib][n] += g * fixas.get(ra).v;
        }
      };

      componentes.forEach((p) => {
        if (p.tipo === 'resistor') adicionar(rede(p.a), rede(p.b), 1 / (p.ohms || RESISTOR_PADRAO), 0);
        else if (conduzindo.get(p.id)) adicionar(rede(p.a), rede(p.b), 1 / RESISTENCIA_LED, TENSAO_LED);
      });
      x = resolverSistema(G, n);
    }

    // 4. O LED é uma válvula: descobre por tentativa quais estão conduzindo.
    for (let passo = 0; passo < 16; passo++) {
      calcular();
      let mudou = false;
      leds.forEach((p) => {
        const vd = tensaoDaRede(rede(p.a)) - tensaoDaRede(rede(p.b));
        if (conduzindo.get(p.id) && vd < TENSAO_LED - 1e-9) {
          conduzindo.set(p.id, false);
          mudou = true;
        } else if (!conduzindo.get(p.id) && vd > TENSAO_LED + 1e-6) {
          conduzindo.set(p.id, true);
          mudou = true;
        }
      });
      if (!mudou) break;
    }

    // 5. Corrente em cada peça, medida de a para b.
    const correntes = new Map();
    componentes.forEach((p) => {
      const ra = rede(p.a);
      const rb = rede(p.b);
      if (ra === rb) {
        correntes.set(p.id, 0);
        return;
      }
      const vd = tensaoDaRede(ra) - tensaoDaRede(rb);
      if (p.tipo === 'resistor') correntes.set(p.id, vd / (p.ohms || RESISTOR_PADRAO));
      else correntes.set(p.id, conduzindo.get(p.id) ? (vd - TENSAO_LED) / RESISTENCIA_LED : 0);
    });

    // 6. Quais redes chegam a uma fonte (as outras estão soltas, sem tensão definida).
    const alcancadas = new Set(fixas.keys());
    for (let cresceu = true; cresceu; ) {
      cresceu = false;
      componentes.forEach((p) => {
        if (p.tipo === 'led' && !conduzindo.get(p.id)) return;
        const ra = rede(p.a);
        const rb = rede(p.b);
        if (alcancadas.has(ra) !== alcancadas.has(rb)) {
          alcancadas.add(ra);
          alcancadas.add(rb);
          cresceu = true;
        }
      });
    }

    return {
      rede,
      curtos,
      correntes,
      alimentado: (id) => alcancadas.has(rede(id)),
      tensao: (id) => {
        const r = rede(id);
        return alcancadas.has(r) ? tensaoDaRede(r) : null;
      },
    };
  }

  /* ---------- Diagnóstico: o que está certo ou errado na montagem ---------- */

  const estaAceso = (i) => i > CORRENTE_MIN && i <= CORRENTE_MAX;

  // Procura a única ligação que, se existisse, acenderia o LED.
  function ligacaoQueFalta(pecas, fontes, led, pinoDoPrograma) {
    const res = resolver(pecas, fontes);
    const pontos = new Map();
    const anotar = (f) => {
      const r = res.rede(f);
      if (!pontos.has(r)) pontos.set(r, []);
      pontos.get(r).push(f);
    };
    pecas.forEach((p) => [p.a, p.b].forEach((f) => f && anotar(f)));
    Object.keys(fontes).forEach(anotar);

    const redes = [...pontos.keys()];
    let melhor = null;
    const prioridade = { canaleta: 2, vizinha: 1, separados: 0 };
    // Entre pontos da mesma rede, é melhor citar a perna de um componente do
    // que a ponta de um jumper: é por ela que o aluno se orienta.
    const ehPerna = (f) => pecas.some((p) => p.tipo !== 'jumper' && (p.a === f || p.b === f));
    const nota = ({ a, b, motivo }) => prioridade[motivo] * 10 + Number(ehPerna(a)) + Number(ehPerna(b));

    for (let i = 0; i < redes.length; i++) {
      for (let j = i + 1; j < redes.length; j++) {
        const ponte = { id: '_ponte', tipo: 'jumper', a: pontos.get(redes[i])[0], b: pontos.get(redes[j])[0] };
        const teste = resolver([...pecas, ponte], fontes);
        if (teste.curtos.length || !estaAceso(teste.correntes.get(led.id) || 0)) continue;

        // Com um programa rodando, só serve a ligação que o código controla:
        // se o LED continua aceso com o pino desligado, ele não vai piscar.
        if (pinoDoPrograma) {
          const desligado = resolver([...pecas, ponte], { ...fontes, [pinoDoPrograma]: 0 });
          if (estaAceso(desligado.correntes.get(led.id) || 0)) continue;
        }

        // Entre os furos das duas redes, escolhe o par que melhor explica o erro.
        pontos.get(redes[i]).forEach((a) => {
          pontos.get(redes[j]).forEach((b) => {
            const fa = fileiraDe(a);
            const fb = fileiraDe(b);
            let motivo = 'separados';
            if (fa && fb && fa === fb && ladoDe(a) !== ladoDe(b)) motivo = 'canaleta';
            else if (fa && fb && Math.abs(fa - fb) === 1 && ladoDe(a) === ladoDe(b)) motivo = 'vizinha';
            const candidata = { a, b, motivo };
            if (!melhor || nota(candidata) > nota(melhor)) melhor = candidata;
          });
        });
      }
    }
    return melhor;
  }

  /*
   * Devolve { codigo, ... }. Códigos possíveis:
   * curto, sem-led, queimado, queimou, aceso, mesma-fileira, mesma-rede,
   * invertido, resistor-ignorado, aberto.
   * opcoes.pinoDoPrograma: pino que o código liga e desliga, se houver.
   */
  function analisar(pecas, fontes, opcoes = {}) {
    const res = resolver(pecas, fontes);
    if (res.curtos.length) return { codigo: 'curto', curtos: res.curtos };

    const led = pecas.find((p) => p.tipo === 'led');
    if (!led || !completa(led)) return { codigo: 'sem-led' };
    if (led.queimado) return { codigo: 'queimado' };

    const i = res.correntes.get(led.id) || 0;
    const resistor = pecas.find((p) => p.tipo === 'resistor');
    const resistorIgnorado = Boolean(resistor && completa(resistor) && res.rede(resistor.a) === res.rede(resistor.b));

    if (i > CORRENTE_MAX) return { codigo: 'queimou', i, resistorIgnorado };
    if (estaAceso(i)) return { codigo: 'aceso', i };
    if (faixaDe(led.a) === faixaDe(led.b)) return { codigo: 'mesma-fileira' };
    if (res.rede(led.a) === res.rede(led.b)) return { codigo: 'mesma-rede' };

    const invertido = pecas.map((p) => (p === led ? { ...p, a: p.b, b: p.a } : p));
    const iInvertido = resolver(invertido, fontes).correntes.get(led.id) || 0;
    if (iInvertido > CORRENTE_MIN) return { codigo: 'invertido' };

    if (resistorIgnorado) return { codigo: 'resistor-ignorado' };
    return { codigo: 'aberto', falta: ligacaoQueFalta(pecas, fontes, led, opcoes.pinoDoPrograma) };
  }

  /* ---------- Caminho da corrente, para desenhar na tela ---------- */

  function caminhoDaCorrente(pecas, res, fontes) {
    const saidas = new Map();
    const ligar = (de, para, via) => {
      if (!saidas.has(de)) saidas.set(de, []);
      saidas.get(de).push({ de, para, via });
    };

    // Dentro da mesma tira, a corrente vai direto de um ponto a outro.
    const usados = new Set(Object.keys(fontes));
    pecas.forEach((p) => {
      if (p.a) usados.add(p.a);
      if (p.b) usados.add(p.b);
    });
    const porFaixa = new Map();
    usados.forEach((f) => {
      const faixa = faixaDe(f);
      if (!porFaixa.has(faixa)) porFaixa.set(faixa, []);
      porFaixa.get(faixa).push(f);
    });
    porFaixa.forEach((furos) => {
      furos.forEach((a) => furos.forEach((b) => a !== b && ligar(a, b, null)));
    });

    pecas.filter(completa).forEach((p) => {
      if (p.tipo === 'jumper') {
        ligar(p.a, p.b, p);
        ligar(p.b, p.a, p);
        return;
      }
      const i = res.correntes.get(p.id) || 0;
      if (i > CORRENTE_MIN) ligar(p.a, p.b, p);
      else if (i < -CORRENTE_MIN) ligar(p.b, p.a, p);
    });

    const pinos = Object.entries(fontes).sort((x, y) => y[1] - x[1]);
    for (const [origem, vOrigem] of pinos) {
      const destinos = new Set(pinos.filter(([, v]) => v < vOrigem).map(([p]) => p));
      const veioDe = new Map([[origem, null]]);
      const fila = [origem];
      while (fila.length) {
        const atual = fila.shift();
        if (destinos.has(atual)) {
          const passos = [];
          for (let f = atual; veioDe.get(f); f = veioDe.get(f).de) passos.unshift(veioDe.get(f));
          // Só existe corrente de verdade se o caminho passa por um componente.
          return passos.some((s) => s.via && s.via.tipo !== 'jumper') ? passos : null;
        }
        (saidas.get(atual) || []).forEach((s) => {
          if (!veioDe.has(s.para)) {
            veioDe.set(s.para, s);
            fila.push(s.para);
          }
        });
      }
    }
    return null;
  }

  const Circuito = {
    FILEIRAS,
    COLUNAS,
    TRILHOS,
    PINOS,
    RESISTOR_PADRAO,
    TENSAO_LED,
    CORRENTE_MAX,
    CORRENTE_MIN,
    ehPino,
    ehTrilho,
    faixaDe,
    furosDaFaixa,
    todasAsFaixas,
    todosOsFuros,
    nomeDoFuro,
    completa,
    estaAceso,
    resolver,
    analisar,
    caminhoDaCorrente,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Circuito;
  else global.Circuito = Circuito;
})(typeof window !== 'undefined' ? window : globalThis);
