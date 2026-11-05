/*
 * Tela: desenha a protoboard, cuida do toque e conduz cada etapa.
 * A eletrônica fica em circuito.js e os textos em etapas.js.
 */
(function () {
  'use strict';

  const {
    FILEIRAS,
    RESISTOR_PADRAO,
    ehPino,
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
  } = window.Circuito;
  const { ETAPAS, PERGUNTAS } = window;

  const $ = (id) => document.getElementById(id);
  const placa = $('placa');

  /* ---------- Geometria ---------- */

  const P = 24; // distância entre dois furos, em unidades do SVG
  const COLUNA_X = {
    'E+': 0, 'E-': 1,
    a: 2.5, b: 3.5, c: 4.5, d: 5.5, e: 6.5,
    f: 8.5, g: 9.5, h: 10.5, i: 11.5, j: 12.5,
    'D+': 14, 'D-': 15,
  };
  const MARGEM_X = 0.95;
  const MARGEM_Y = 1.25;
  const X = (coluna) => (MARGEM_X + COLUNA_X[coluna]) * P;
  const Y = (fileira) => (MARGEM_Y + fileira - 1) * P;
  const LARGURA = (MARGEM_X * 2 + 15) * P;
  const ALTURA = (MARGEM_Y * 2 + FILEIRAS - 1) * P;
  const ALTURA_ARDUINO = 2.25 * P;

  const POS = {
    '5V': { x: 2.2 * P, y: -0.9 * P },
    GND: { x: 4.6 * P, y: -0.9 * P },
    3: { x: 12.3 * P, y: -0.9 * P },
  };
  todosOsFuros().forEach((id) => {
    const m = /^([a-j]|[ED][+-])(\d+)$/.exec(id);
    POS[id] = { x: X(m[1]), y: Y(Number(m[2])) };
  });

  const ALCANCE = { led: 4.2 * P, resistor: 9 * P, jumper: Infinity }; // pernas reais não esticam
  const COR_JUMPER = { vermelho: '#e3342f', preto: '#23262f', amarelo: '#f2b705' };
  const LISTRAS_RESISTOR = ['#c62828', '#c62828', '#6d3b1f', '#c9a227']; // 220 Ω ±5%

  /* ---------- Estado ---------- */

  const S = {
    etapa: null,
    cenaIdx: 0,
    cena: null,
    pecas: [],
    ativo: null, // { peca, perna }: próxima perna a colocar
    arrasto: null,
    sonda: null, // dedo sobre um furo, sem peça na mão
    raiox: false,
    objetivoIdx: 0,
    feitos: new Set(),
    completa: false,
    queimou: false,
    ultima: null,
    pino3: true,
    timer: null,
    res: null,
    fila: [],
    pergunta: null,
    tipoPergunta: null,
    respondida: false,
    acertos: 0,
    totalPerguntas: 0,
    timerQuiz: null,
    timerAviso: null,
    pendencia: null, // problema atual da montagem: volta à tela depois de um toque
    aula: null, // { telas, idx } quando está no datashow
    quadroIdx: 0,
    timerQuadro: null,
    timerRaiox: null,
    mostrarEntendi: false,
    montagemFinal: [],
  };

  const TIRAS = {};
  let contadorPecas = 0;

  /* ---------- Desenho fixo da placa ---------- */

  function montarPlaca() {
    const furo = (id) => {
      const { x, y } = POS[id];
      return `<rect class="furo" x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2.5"/>`;
    };
    const tira = (faixa) => {
      const furos = furosDaFaixa(faixa);
      const a = POS[furos[0]];
      const b = POS[furos[furos.length - 1]];
      const m = P * 0.38;
      return `<rect class="tira" data-faixa="${faixa}" x="${a.x - m}" y="${a.y - m}" width="${b.x - a.x + 2 * m}" height="${b.y - a.y + 2 * m}" rx="7"/>`;
    };
    const rotulo = (x, y, texto, classe = '') =>
      `<text class="rotulo ${classe}" x="${x}" y="${y}">${texto}</text>`;

    const linhaTrilho = (classe, x) => {
      const y1 = 0.3 * P;
      const y2 = ALTURA - 0.3 * P;
      return `<line class="${classe}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>`;
    };

    let rotulos = '';
    'abcdefghij'.split('').forEach((c) => {
      rotulos += rotulo(X(c), 0.56 * P, c) + rotulo(X(c), ALTURA - 0.56 * P, c);
    });
    for (let n = 1; n <= FILEIRAS; n++) {
      rotulos += rotulo((MARGEM_X + 1.86) * P, Y(n), n) + rotulo((MARGEM_X + 13.14) * P, Y(n), n);
    }
    [['E+', '+'], ['E-', '−'], ['D+', '+'], ['D-', '−']].forEach(([t, s]) => {
      rotulos += rotulo(X(t), 0.56 * P, s, 'sinal') + rotulo(X(t), ALTURA - 0.56 * P, s, 'sinal');
    });

    const soquete = (pino, rotuloPino) => {
      const { x, y } = POS[pino];
      return `
        <text class="pcb-pino" x="${x}" y="${y - 0.74 * P}">${rotuloPino}</text>
        <rect class="conector" x="${x - 0.62 * P}" y="${y - 0.42 * P}" width="${1.24 * P}" height="${0.84 * P}" rx="3"/>
        <rect class="soquete" x="${x - 5}" y="${y - 5}" width="10" height="10" rx="1.5"/>`;
    };

    placa.setAttribute('viewBox', `0 0 ${LARGURA} ${ALTURA}`);
    placa.innerHTML = `
      <defs>
        <radialGradient id="brilho">
          <stop offset="0" stop-color="#ffd9c4" stop-opacity="0.95"/>
          <stop offset="0.4" stop-color="#ff5a4a" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#ff3b30" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <g id="cena">
        <g id="gArduino">
          <rect class="pcb" x="0" y="${-ALTURA_ARDUINO}" width="${LARGURA}" height="${ALTURA_ARDUINO - 0.26 * P}" rx="9"/>
          <text class="pcb-nome" x="${LARGURA * 0.49}" y="${-1.25 * P}">ARDUINO UNO</text>
          ${soquete('5V', '5V')}${soquete('GND', 'GND')}${soquete('3', '~3')}
          <circle id="ledL" class="led-l" cx="${15 * P}" cy="${-1.24 * P}" r="5"/>
          <text class="pcb-pino" x="${15 * P}" y="${-0.68 * P}">L</text>
        </g>
        <rect class="plastico" x="0" y="0" width="${LARGURA}" height="${ALTURA}" rx="11"/>
        <rect class="canaleta" x="${(MARGEM_X + 7.08) * P}" y="0" width="${0.84 * P}" height="${ALTURA}"/>
        ${linhaTrilho('linha-mais', (MARGEM_X - 0.52) * P)}
        ${linhaTrilho('linha-menos', (MARGEM_X + 1.52) * P)}
        ${linhaTrilho('linha-mais', (MARGEM_X + 13.48) * P)}
        ${linhaTrilho('linha-menos', (MARGEM_X + 15.52) * P)}
        ${todasAsFaixas().map(tira).join('')}
        ${rotulos}
        ${todosOsFuros().map(furo).join('')}
        <g id="gPecas"></g>
        <g id="gCorrente"></g>
        <g id="gMarcas"></g>
      </g>`;
    placa.querySelectorAll('.tira').forEach((el) => {
      TIRAS[el.dataset.faixa] = el;
    });
  }

  /* ---------- Desenho das peças ---------- */

  // Curva do jumper, sempre calculada de a para b. Para percorrer ao contrário,
  // basta trocar os pontos de controle e a forma continua a mesma.
  function curvaJumper(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const arco = Math.min(30, d * 0.3);
    let nx = dy / d;
    let ny = -dx / d;
    if (ny > 0 || (ny === 0 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    return {
      c1: { x: a.x + dx * 0.25 + nx * arco, y: a.y + dy * 0.25 + ny * arco },
      c2: { x: a.x + dx * 0.75 + nx * arco, y: a.y + dy * 0.75 + ny * arco },
    };
  }

  function pontaDoFio(de, para) {
    const d = Math.hypot(para.x - de.x, para.y - de.y) || 1;
    const fim = { x: de.x + ((para.x - de.x) / d) * 8, y: de.y + ((para.y - de.y) / d) * 8 };
    return `<line class="ponta" x1="${de.x}" y1="${de.y}" x2="${fim.x}" y2="${fim.y}"/>`;
  }

  function svgJumper(p, a, b) {
    const { c1, c2 } = curvaJumper(a, b);
    const d = `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    return `
      <path class="fio-contorno" d="${d}"/>
      <path class="fio" d="${d}" stroke="${COR_JUMPER[p.cor]}"/>
      ${pontaDoFio(a, c1)}${pontaDoFio(b, c2)}`;
  }

  function svgResistor(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const comprimento = Math.max(15, Math.min(36, d - 14));
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const angulo = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const listras = LISTRAS_RESISTOR.map((cor, i) => {
      const x = (-0.34 + [0, 0.19, 0.38, 0.68][i]) * comprimento;
      return `<rect x="${x - 1.6}" y="-6" width="3.2" height="12" fill="${cor}"/>`;
    }).join('');
    return `
      <line class="perna" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
      <circle class="perna-ponto" cx="${a.x}" cy="${a.y}" r="3.2"/>
      <circle class="perna-ponto" cx="${b.x}" cy="${b.y}" r="3.2"/>
      <g transform="translate(${cx} ${cy}) rotate(${angulo})">
        <rect class="corpo-resistor" x="${-comprimento / 2}" y="-6" width="${comprimento}" height="12" rx="5"/>
        ${listras}
      </g>`;
  }

  function svgLED(p, a, b) {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const angulo = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const i = S.res && completa(p) ? S.res.correntes.get(p.id) || 0 : 0;
    const aceso = !p.queimado && !S.arrasto && estaAceso(i);
    const estado = p.queimado ? 'queimado' : aceso ? 'aceso' : '';
    const sinal = (q, texto) => `
      <circle class="sinal-led" cx="${q.x}" cy="${q.y}" r="6.6"/>
      <text class="sinal-led-texto" x="${q.x}" y="${q.y}">${texto}</text>`;
    return `
      <g class="led ${estado}">
        ${aceso ? `<circle cx="${cx}" cy="${cy}" r="38" fill="url(#brilho)"/>` : ''}
        <line class="perna" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
        ${sinal(a, '+')}${sinal(b, '−')}
        <g transform="translate(${cx} ${cy}) rotate(${angulo})">
          <path class="cupula" d="M 8 -6 A 10 10 0 1 0 8 6 Z"/>
          ${aceso ? '<circle r="4.5" fill="#fff6e6" opacity="0.9"/>' : '<circle cx="-3" cy="-3" r="2.4" fill="#fff" opacity="0.45"/>'}
        </g>
        ${p.queimado ? `<g class="fumaca" transform="translate(${cx} ${cy})"><circle r="7"/><circle cx="4" r="6"/><circle cx="-4" r="5"/></g>` : ''}
      </g>`;
  }

  // Posição de cada ponta, já contando a perna que está sendo arrastada.
  function extremos(p) {
    let a = p.a;
    let b = p.b;
    const A = S.arrasto;
    if (A && A.peca === p && A.alvo && A.ok) {
      if (A.perna === 'a') a = A.alvo;
      else b = A.alvo;
    }
    return { a: a && POS[a], b: b && POS[b] };
  }

  function pontaSolta(q) {
    const x = q.x + P * 1.2 > LARGURA - 8 ? q.x - P * 1.2 : q.x + P * 1.2;
    return { x, y: q.y + P * 0.9 > ALTURA - 8 ? q.y - P * 0.9 : q.y + P * 0.9 };
  }

  function desenharPeca(p) {
    let { a, b } = extremos(p);
    if (!a && !b) return '';
    const solta = !a || !b;
    if (!a) a = pontaSolta(b);
    if (!b) b = pontaSolta(a);
    const desenho =
      p.tipo === 'jumper' ? svgJumper(p, a, b) : p.tipo === 'resistor' ? svgResistor(a, b) : svgLED(p, a, b);
    return solta ? `<g class="solta">${desenho}</g>` : desenho;
  }

  function desenharPecas() {
    $('gPecas').innerHTML = S.pecas.map(desenharPeca).join('');
  }

  function desenharCorrente() {
    const g = $('gCorrente');
    if (S.arrasto || !S.res || S.res.curtos.length) {
      g.innerHTML = '';
      return;
    }
    const passos = caminhoDaCorrente(S.pecas, S.res, fontesAgora());
    if (!passos) {
      g.innerHTML = '';
      return;
    }
    let d = `M ${POS[passos[0].de].x} ${POS[passos[0].de].y}`;
    passos.forEach((s) => {
      const q = POS[s.para];
      if (s.via && s.via.tipo === 'jumper') {
        const { c1, c2 } = curvaJumper(POS[s.via.a], POS[s.via.b]);
        const [u, v] = s.de === s.via.a ? [c1, c2] : [c2, c1];
        d += ` C ${u.x} ${u.y} ${v.x} ${v.y} ${q.x} ${q.y}`;
      } else {
        d += ` L ${q.x} ${q.y}`;
      }
    });
    g.innerHTML = `<path class="corrente-fundo" d="${d}"/><path class="corrente" d="${d}"/>`;
  }

  /* ---------- Animação: a corrente dentro das tiras ---------- */

  // As tiras da direita e dos trilhos − correm no sentido contrário. Assim as
  // setas dos dois lados se encontram na canaleta, em vez de uma parecer a
  // continuação da outra, que é justamente o erro que queremos evitar.
  function trajetoDaFaixa(faixa) {
    const furos = furosDaFaixa(faixa);
    const aoContrario = faixa.startsWith('dir') || faixa.endsWith('-');
    return aoContrario ? [...furos].reverse() : furos;
  }

  // Todas as tiras viram um traço só: com 28 tiras animadas em separado,
  // um celular simples poderia engasgar.
  function desenharFluxos(faixas, comRotulos) {
    const pilula = (q, texto) => `
      <rect class="pilula" x="${q.x - 20}" y="${q.y - 26}" width="40" height="16" rx="8"/>
      <text class="pilula-texto" x="${q.x}" y="${q.y - 18}">${texto}</text>`;
    let d = '';
    let extras = '';
    faixas.forEach((faixa) => {
      const furos = trajetoDaFaixa(faixa);
      const a = POS[furos[0]];
      const b = POS[furos[furos.length - 1]];
      const ponta = { x: b.x + Math.sign(b.x - a.x) * 10, y: b.y + Math.sign(b.y - a.y) * 10 };
      const angulo = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      d += `M ${a.x} ${a.y} L ${ponta.x} ${ponta.y} `;
      extras += `<path class="seta" transform="translate(${ponta.x} ${ponta.y}) rotate(${angulo})" d="M -9 -5 L 1 0 L -9 5 Z"/>`;
      if (comRotulos) extras += pilula(a, 'entra') + pilula(b, 'sai');
    });
    $('gCorrente').innerHTML = d
      ? `<path class="corrente-fundo" d="${d}"/><path class="corrente" d="${d}"/>${extras}`
      : '';
  }

  function pintarQuadro(q) {
    clearTimeout(S.timerRaiox);
    const faixas = q.faixas || [];
    limparMarcadas();
    faixas.forEach((f) => marcarFaixa(f));
    $('cena').classList.toggle('foco', faixas.length > 0);
    document.querySelector('.canaleta').classList.toggle('cortada', Boolean(q.canaleta));
    desenharFluxos(faixas, q.rotulos);

    // O primeiro quadro começa com a placa fechada e tira o plástico depois.
    definirRaiox(!q.revelarEm);
    if (q.revelarEm) S.timerRaiox = setTimeout(() => definirRaiox(true), q.revelarEm);
  }

  function mostrarQuadro(q) {
    pintarQuadro(q);
    S.completa = S.quadroIdx === S.cena.quadros.length - 1;
    desenharGuia();
    desenharBandeja();
    if (!S.completa) S.timerQuadro = setTimeout(proximoQuadro, q.ms);
  }

  function proximoQuadro() {
    S.quadroIdx++;
    mostrarQuadro(S.cena.quadros[S.quadroIdx]);
  }

  function iniciarAnimacao() {
    clearTimeout(S.timerQuadro);
    S.quadroIdx = 0;
    mostrarQuadro(S.cena.quadros[0]);
  }

  function pularAnimacao() {
    clearTimeout(S.timerQuadro);
    S.quadroIdx = S.cena.quadros.length - 1;
    mostrarQuadro(S.cena.quadros[S.quadroIdx]);
  }

  function pintarTiras() {
    todasAsFaixas().forEach((faixa) => {
      const v = S.res ? S.res.tensao(furosDaFaixa(faixa)[0]) : null;
      const el = TIRAS[faixa];
      el.classList.toggle('v5', v !== null && v >= 4.5);
      el.classList.toggle('v0', v !== null && v <= 0.5);
      el.classList.toggle('vm', v !== null && v > 0.5 && v < 4.5);
    });
  }

  const fontesAgora = () => {
    const fontes = { ...(S.cena.fontes || {}) };
    if (S.cena.programa === 'blink') fontes[3] = S.pino3 ? 5 : 0;
    return fontes;
  };

  function desenharEletrica() {
    S.res = resolver(S.pecas, fontesAgora());
    desenharPecas();
    desenharCorrente();
    pintarTiras();
    if (S.cena.programa === 'blink') {
      // Igual ao sketch: quando o pino 3 liga, o LED da placa desliga.
      $('ledL').classList.toggle('acesa', !S.pino3);
      $('linhaCodigo').textContent = `digitalWrite(3, ${S.pino3 ? 'HIGH' : 'LOW'});  delay(1000);`;
    }
  }

  /* ---------- Marcas sobre a placa ---------- */

  function limparMarcadas() {
    Object.values(TIRAS).forEach((el) => el.classList.remove('marcada', 'errada'));
  }

  function marcarFaixa(faixa, classe = 'marcada') {
    if (TIRAS[faixa]) TIRAS[faixa].classList.add(classe);
  }

  // Destaca a tira e tudo que os jumpers ligam a ela.
  function marcarRede(furo) {
    if (!S.res) {
      marcarFaixa(faixaDe(furo));
      return;
    }
    const rede = S.res.rede(furo);
    todasAsFaixas().forEach((f) => {
      if (S.res.rede(furosDaFaixa(f)[0]) === rede) marcarFaixa(f);
    });
  }

  function desenharMarcas(alvo, valido) {
    const anel = (f, classe) => `<circle class="${classe}" cx="${POS[f].x}" cy="${POS[f].y}" r="10.5"/>`;
    let s = '';
    if (S.cena && S.cena.tipo === 'quiz' && S.pergunta) s += S.pergunta.marcas.map((f) => anel(f, 'marca')).join('');
    if (alvo) s += anel(alvo, valido ? 'alvo' : 'alvo invalido');
    $('gMarcas').innerHTML = s;
  }

  function mostrarLente(e, alvo, valido) {
    const lente = $('lente');
    if (!alvo || e.pointerType === 'mouse') {
      lente.hidden = true;
      return;
    }
    const caixa = lente.parentElement.getBoundingClientRect();
    const t = 118;
    let x = e.clientX - caixa.left - t / 2;
    let y = e.clientY - caixa.top - t - 44;
    if (y < 0) {
      y = Math.max(0, e.clientY - caixa.top - t / 2);
      x += x + t / 2 < caixa.width / 2 ? 92 : -92;
    }
    x = Math.max(0, Math.min(caixa.width - t, x));
    lente.style.transform = `translate(${x}px, ${y}px)`;
    const q = POS[alvo];
    const v = P * 4.6;
    $('lenteSvg').setAttribute('viewBox', `${q.x - v / 2} ${q.y - v / 2} ${v} ${v}`);
    lente.classList.toggle('invalida', !valido);
    lente.hidden = false;
  }

  function avisar(texto, tom = '') {
    const el = $('aviso');
    el.hidden = true;
    el.textContent = texto;
    el.className = 'aviso ' + tom;
    void el.offsetWidth; // reinicia a animação de entrada
    el.hidden = false;
    // Sucesso sai sozinho para não cobrir o LED. Erro fica até o próximo toque.
    clearTimeout(S.timerAviso);
    if (tom === 'bom') S.timerAviso = setTimeout(esconderAviso, 7000);
  }

  function esconderAviso() {
    clearTimeout(S.timerAviso);
    $('aviso').hidden = true;
  }

  function definirRaiox(ligado) {
    S.raiox = ligado;
    // A classe fica em #cena porque a lente clona esse grupo: fora dele, o clone não a veria.
    $('cena').classList.toggle('raiox', ligado);
    $('btRaiox').setAttribute('aria-pressed', String(ligado));
  }

  /* ---------- Textos que dependem do circuito ---------- */

  const nomePeca = (p) => (p.tipo === 'led' ? 'LED' : p.tipo === 'resistor' ? 'resistor' : `jumper ${p.cor}`);

  function textoDaPerna(p, perna) {
    if (p.tipo === 'led') return perna === 'a' ? 'Perna longa (+) do LED' : 'Perna curta (−) do LED';
    if (p.tipo === 'resistor') return perna === 'a' ? 'Uma perna do resistor' : 'Outra perna do resistor';
    return perna === 'a' ? `Uma ponta do jumper ${p.cor}` : `Outra ponta do jumper ${p.cor}`;
  }

  function descreverAlvo(alvo, atual, perna) {
    const nome = nomeDoFuro(alvo);
    if (atual) {
      const outra = atual[perna === 'a' ? 'b' : 'a'];
      if (outra && faixaDe(outra) === faixaDe(alvo)) return `${nome}: mesma tira da outra perna`;
    }
    const vizinha = S.pecas.find(
      (p) => p !== atual && [p.a, p.b].some((f) => f && faixaDe(f) === faixaDe(alvo))
    );
    return vizinha ? `${nome}: mesma tira do ${nomePeca(vizinha)}` : nome;
  }

  // Fala da peça, em vez de só do furo: é assim que o aluno pensa na montagem.
  function quemEsta(furo) {
    const dono = pernaEm(furo);
    if (!dono) return `o ${nomeDoFuro(furo)}`;
    const { peca, perna } = dono;
    if (peca.tipo === 'led') return `a perna ${perna === 'a' ? 'longa' : 'curta'} do LED (${furo})`;
    if (peca.tipo === 'resistor') return `o resistor (${furo})`;
    return `o jumper ${peca.cor} (${nomeDoFuro(furo)})`;
  }

  const comMaiuscula = (t) => t[0].toUpperCase() + t.slice(1);

  function textoDaFalta(falta) {
    if (!falta) {
      return 'O caminho ainda está aberto. A corrente precisa sair do pino, passar pelo resistor e pelo LED e voltar para o GND.';
    }
    const pinoVazio = [falta.a, falta.b].find((f) => ehPino(f) && !pernaEm(f));
    if (pinoVazio) {
      const outro = pinoVazio === falta.a ? falta.b : falta.a;
      const saida = pinoVazio === 'GND' ? 'voltar' : 'sair';
      return `O ${nomeDoFuro(pinoVazio)} está vazio: a corrente não tem por onde ${saida}. Ligue esse pino com um jumper à mesma tira d${quemEsta(outro)}.`;
    }
    const a = quemEsta(falta.a);
    const b = quemEsta(falta.b);
    if (falta.motivo === 'canaleta') {
      return `Quase! ${comMaiuscula(a)} e ${b} estão em lados opostos da canaleta, então não se tocam.`;
    }
    if (falta.motivo === 'vizinha') {
      return `Quase! ${comMaiuscula(a)} e ${b} estão em fileiras vizinhas. Cada fileira é uma tira separada.`;
    }
    return `O caminho está aberto: falta ligar ${a} com ${b}.`;
  }

  function textoDoCurto(diag) {
    const pinos = diag.curtos[0].filter((p) => p !== 'GND').join(' e ');
    return `Curto-circuito: o ${pinos} foi direto para o GND, sem nada no caminho. Na bancada isso pode desligar o Arduino e danificar a placa. Tire esse jumper.`;
  }

  const textoQueimou = (diag) =>
    diag.resistorIgnorado
      ? 'O LED queimou. O resistor estava com as duas pernas na mesma tira, e a corrente passou direto pelo metal.'
      : 'O LED queimou: sem resistor no caminho, a corrente passou do limite.';

  const miliamperes = (i) => (i * 1000).toFixed(1).replace('.', ',');

  const TEXTOS_DIAGNOSTICO = {
    'mesma-fileira': 'As duas pernas do LED estão na mesma tira de metal. Coloque cada perna em uma fileira diferente.',
    'mesma-rede': 'Um jumper está ligando as duas pernas do LED, e a corrente desvia por ele. Tire esse jumper do caminho.',
    invertido: 'LED invertido. A perna longa (+) precisa ficar do lado do 5V.',
    'resistor-ignorado':
      'As duas pernas do resistor estão ligadas pela mesma tira, então a corrente não passa por ele. Coloque cada perna em uma fileira diferente.',
  };

  /* ---------- Bandeja, guia e dica ---------- */

  function iconePeca(p) {
    if (p.tipo === 'jumper') {
      const d = 'M4 19 C 12 1, 28 1, 36 19';
      return `<svg viewBox="0 0 40 24" aria-hidden="true">
        <path d="${d}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="5.6" stroke-linecap="round"/>
        <path d="${d}" fill="none" stroke="${COR_JUMPER[p.cor]}" stroke-width="3.8" stroke-linecap="round"/>
      </svg>`;
    }
    if (p.tipo === 'resistor') {
      const listras = LISTRAS_RESISTOR.map(
        (cor, i) => `<rect x="${[12, 16, 20, 26][i]}" y="6" width="2.4" height="12" fill="${cor}"/>`
      ).join('');
      return `<svg viewBox="0 0 40 24" aria-hidden="true">
        <line x1="1" y1="12" x2="39" y2="12" stroke="#c3cad3" stroke-width="2"/>
        <rect x="9" y="6" width="22" height="12" rx="5" fill="#e4c291"/>${listras}
      </svg>`;
    }
    return `<svg viewBox="0 0 40 24" aria-hidden="true">
      <line x1="16" y1="12" x2="16" y2="24" stroke="#c3cad3" stroke-width="2"/>
      <line x1="24" y1="12" x2="24" y2="19" stroke="#c3cad3" stroke-width="2"/>
      <path d="M12 13 V8 a8 7 0 0 1 16 0 V13 Z" fill="#e0303d"/>
    </svg>`;
  }

  const movimentaveis = () => S.pecas.filter((p) => !p.fixa);
  const todasColocadas = () => movimentaveis().every((p) => p.reserva || completa(p));

  function desenharBandeja() {
    const bandeja = $('bandeja');
    bandeja.textContent = '';
    const cena = S.cena;

    const botao = (texto, classe, acao) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = classe;
      b.textContent = texto;
      b.addEventListener('click', acao);
      bandeja.appendChild(b);
      return b;
    };

    if (cena.tipo === 'animacao') {
      botao(S.completa ? 'Ver de novo' : 'Pular', 'bt-secundario', S.completa ? iniciarAnimacao : pularAnimacao);
    }
    if (S.completa) {
      const ultima = S.cenaIdx === S.etapa.cenas.length - 1;
      const fimDaEtapa = S.etapa.bancada ? 'Ir para a bancada' : 'Próxima etapa';
      botao(cena.botao || (ultima ? fimDaEtapa : 'Continuar'), 'bt-principal', continuar);
      return;
    }
    if (cena.tipo === 'quiz') {
      const q = S.pergunta;
      if (!q) return;
      if (S.respondida) {
        if (S.mostrarEntendi) botao('Entendi', 'bt-principal', proximaPergunta);
        return;
      }
      if (!q.toque) {
        botao('Sim', 'bt-resposta', () => corrigir(q.resposta === true));
        botao('Não', 'bt-resposta', () => corrigir(q.resposta === false));
      }
      return;
    }
    if (cena.tipo !== 'montagem') return;

    const led = S.pecas.find((p) => p.tipo === 'led');
    if (led && led.queimado) {
      botao('Trocar o LED', 'bt-principal', trocarLED);
      return;
    }

    let jaConvidou = false;
    movimentaveis().forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'peca';
      const nome =
        p.tipo === 'led' ? 'LED' : p.tipo === 'resistor' ? `${RESISTOR_PADRAO} Ω` : p.cor[0].toUpperCase() + p.cor.slice(1);
      b.innerHTML = `${iconePeca(p)}<span>${nome}</span>`;
      const ativa = S.ativo && S.ativo.peca === p;
      if (ativa) b.classList.add('ativa');
      if (completa(p)) {
        b.classList.add('colocada');
        b.setAttribute('aria-label', `Tirar ${nomePeca(p)} da placa`);
      } else if (!S.ativo && !jaConvidou && !p.reserva) {
        b.classList.add('convite');
        jaConvidou = true;
      }
      b.addEventListener('pointerdown', (e) => {
        if (completa(p)) return;
        ativar(p, b);
        comecarArrasto(p, S.ativo.perna, 'bandeja', e, null);
      });
      b.addEventListener('click', () => {
        if (completa(p)) retirar(p);
      });
      bandeja.appendChild(b);
    });
  }

  function desenharGuia() {
    const cena = S.cena;
    const metas = $('metas');
    metas.className = 'metas';
    metas.textContent = '';
    let texto = cena.texto || '';

    const item = (rotulo, feita, atual) => {
      const li = document.createElement('li');
      li.textContent = rotulo;
      if (feita) li.classList.add('feita');
      if (atual) li.classList.add('atual');
      metas.appendChild(li);
    };

    if (cena.tipo === 'animacao') {
      metas.classList.add('passos-curtos');
      cena.quadros.forEach((q, i) => item('', i < S.quadroIdx, i === S.quadroIdx));
      texto = cena.quadros[S.quadroIdx].texto;
    } else if (cena.tipo === 'quiz') {
      metas.classList.add('passos-curtos');
      for (let i = 0; i < S.totalPerguntas; i++) item('', i < S.acertos, i === S.acertos);
      if (S.pergunta) texto = S.pergunta.texto;
    } else {
      const objs = cena.objetivos;
      if (cena.ordem) {
        const atual = objs[Math.min(S.objetivoIdx, objs.length - 1)];
        texto = S.completa && cena.fim ? cena.fim : atual.texto;
        if (objs.length > 1) {
          metas.classList.add('passos-curtos');
          objs.forEach((o, i) => item('', S.feitos.has(o.id), i === S.objetivoIdx));
        }
      } else {
        if (S.completa && cena.fim) texto = cena.fim;
        objs.forEach((o) => item(o.rotulo, S.feitos.has(o.id)));
      }
    }
    $('texto').textContent = texto;
  }

  function dica(texto, classe = '') {
    const el = $('dica');
    el.textContent = texto;
    el.className = 'dica ' + classe;
  }

  function dicaDoMomento() {
    const cena = S.cena;
    if (cena.aula) {
      dica(AJUDA_AULA);
    } else if (cena.tipo === 'quiz') {
      const q = S.pergunta;
      dica(q && q.toque && !S.respondida ? 'Toque direto na placa.' : '');
    } else if (S.completa) {
      dica('');
    } else if (S.ativo) {
      dica(`${textoDaPerna(S.ativo.peca, S.ativo.perna)}: toque em um furo`, 'forte');
    } else if (S.pecas.some((p) => p.tipo === 'led' && p.queimado)) {
      dica('Troque o LED para continuar.', 'problema');
    } else if (movimentaveis().some((p) => !p.reserva && !completa(p))) {
      dica('Toque em uma peça aqui embaixo.');
    } else if (movimentaveis().length) {
      dica('Arraste uma perna para mudar de furo.');
    } else {
      dica('');
    }
  }

  /* ---------- Colocar e tirar peças ---------- */

  function pernaEm(furo) {
    for (const p of S.pecas) {
      if (p.a === furo) return { peca: p, perna: 'a' };
      if (p.b === furo) return { peca: p, perna: 'b' };
    }
    return null;
  }

  function checarAlvo(p, perna, alvo) {
    if (!alvo) return { ok: false };
    if (p[perna] === alvo) return { ok: true };
    if (ehPino(alvo) && p.tipo !== 'jumper') return { ok: false, motivo: 'Só o jumper vai direto no Arduino.' };
    if (pernaEm(alvo)) return { ok: false, motivo: 'Esse furo já está ocupado. Cada furo recebe uma perna só.' };
    const outra = p[perna === 'a' ? 'b' : 'a'];
    if (outra) {
      const distancia = Math.hypot(POS[outra].x - POS[alvo].x, POS[outra].y - POS[alvo].y);
      if (distancia > ALCANCE[p.tipo]) {
        return { ok: false, motivo: `As pernas do ${nomePeca(p)} não alcançam tão longe.` };
      }
    }
    return { ok: true };
  }

  // Só troca classes: refazer os botões aqui derrubaria o arrasto no iPhone,
  // porque o botão tocado sairia da página no meio do gesto.
  function ativar(p, botao) {
    S.ativo = { peca: p, perna: p.a ? 'b' : 'a' };
    document.querySelectorAll('.peca').forEach((b) => {
      b.classList.toggle('ativa', b === botao);
      b.classList.remove('convite');
    });
    dicaDoMomento();
  }

  function retirar(p) {
    p.a = null;
    p.b = null;
    S.ativo = null;
    if (S.ultima === p) S.ultima = null;
    esconderAviso();
    aposMudanca();
  }

  function trocarLED() {
    const led = S.pecas.find((p) => p.tipo === 'led');
    led.queimado = false;
    S.queimou = false;
    if (S.ultima && !S.ultima.fixa) {
      S.ultima.a = null;
      S.ultima.b = null;
    }
    S.ultima = null;
    S.ativo = null;
    esconderAviso();
    aposMudanca();
  }

  /* ---------- Ponteiro: mesmo código para dedo e mouse ---------- */

  function pontoNaPlaca(e) {
    const m = placa.getScreenCTM().inverse();
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
  }

  function furoPerto(e) {
    const pt = pontoNaPlaca(e);
    const comArduino = S.cena && S.cena.tipo === 'montagem';
    let melhor = null;
    let menor = (P * 0.95) ** 2;
    Object.keys(POS).forEach((id) => {
      if (ehPino(id) && !comArduino) return;
      const d = (POS[id].x - pt.x) ** 2 + (POS[id].y - pt.y) ** 2;
      if (d < menor) {
        menor = d;
        melhor = id;
      }
    });
    return melhor;
  }

  function comecarArrasto(peca, perna, origem, e, alvo) {
    S.arrasto = { peca, perna, origem, alvo: undefined, ok: false, motivo: null };
    $('gCorrente').innerHTML = '';
    esconderAviso();
    atualizarArrasto(e, alvo);
  }

  function atualizarArrasto(e, alvo) {
    const A = S.arrasto;
    if (alvo === A.alvo) {
      mostrarLente(e, alvo, A.ok);
      return;
    }
    const r = checarAlvo(A.peca, A.perna, alvo);
    A.alvo = alvo;
    A.ok = r.ok;
    A.motivo = r.motivo;
    limparMarcadas();
    if (alvo) marcarFaixa(faixaDe(alvo));
    desenharMarcas(alvo, r.ok);
    desenharPecas();
    mostrarLente(e, alvo, r.ok);
    if (alvo) dica(r.ok ? descreverAlvo(alvo, A.peca, A.perna) : r.motivo || nomeDoFuro(alvo), r.ok ? 'forte' : 'problema');
    else dicaDoMomento();
  }

  function soltarArrasto() {
    const A = S.arrasto;
    S.arrasto = null;
    $('lente').hidden = true;
    limparMarcadas();
    desenharMarcas(null);

    if (!A.alvo || !A.ok) {
      if (A.motivo) avisar(A.motivo, 'alerta');
      else lembrarPendencia();
      desenharEletrica();
      dicaDoMomento();
      return;
    }
    if (A.peca[A.perna] === A.alvo) {
      lembrarPendencia();
      desenharEletrica();
      dicaDoMomento();
      return;
    }
    A.peca[A.perna] = A.alvo;
    S.ultima = A.peca;
    const outra = A.perna === 'a' ? 'b' : 'a';
    S.ativo = A.peca[outra] ? null : { peca: A.peca, perna: outra };
    aposMudanca();
  }

  function atualizarSonda(e, alvo) {
    S.sonda.alvo = alvo;
    limparMarcadas();
    desenharMarcas(alvo, true);
    mostrarLente(e, alvo, true);
    if (!alvo) {
      dicaDoMomento();
      return;
    }
    if (S.cena.tipo === 'quiz') {
      dica(nomeDoFuro(alvo), 'forte');
      return;
    }
    marcarRede(alvo);
    dica(descreverAlvo(alvo), 'forte');
  }

  function soltarSonda() {
    const { alvo } = S.sonda;
    S.sonda = null;
    $('lente').hidden = true;
    desenharMarcas(null);
    if (S.cena.tipo !== 'quiz') {
      lembrarPendencia();
      dicaDoMomento();
      return;
    }
    if (alvo) {
      const q = S.pergunta;
      if (!q || S.respondida || !q.toque) {
        dicaDoMomento();
      } else if (q.marcas.includes(alvo)) {
        avisar('Esse é o furo marcado. Toque em outro ligado a ele.');
      } else {
        corrigir(q.confere(alvo), alvo);
      }
    }
  }

  placa.addEventListener('pointerdown', (e) => {
    if (e.button || !S.cena || S.cena.tipo === 'animacao') return;
    e.preventDefault();
    const alvo = furoPerto(e);
    if (S.cena.tipo !== 'quiz') esconderAviso();

    if (S.cena.tipo === 'montagem') {
      if (S.ativo) {
        comecarArrasto(S.ativo.peca, S.ativo.perna, 'placa', e, alvo);
        return;
      }
      const dono = alvo && pernaEm(alvo);
      if (dono && dono.peca.fixa) {
        S.sonda = { alvo };
        atualizarSonda(e, alvo);
        dica('Essa peça já está no lugar nesta etapa.');
        return;
      }
      if (dono) {
        comecarArrasto(dono.peca, dono.perna, 'placa', e, alvo);
        return;
      }
    }
    S.sonda = { alvo };
    atualizarSonda(e, alvo);
  });

  window.addEventListener('pointermove', (e) => {
    if (S.arrasto) {
      e.preventDefault();
      atualizarArrasto(e, furoPerto(e));
    } else if (S.sonda) {
      e.preventDefault();
      const alvo = furoPerto(e);
      if (alvo !== S.sonda.alvo) atualizarSonda(e, alvo);
    }
  });

  function aoSoltar() {
    if (S.arrasto) soltarArrasto();
    if (S.sonda) soltarSonda();
  }
  window.addEventListener('pointerup', aoSoltar);
  window.addEventListener('pointercancel', aoSoltar);

  $('btRaiox').addEventListener('click', () => {
    definirRaiox(!S.raiox);
    desenharEletrica();
  });

  /* ---------- Avaliação da montagem ---------- */

  function avaliar() {
    const cena = S.cena;
    const fontes = cena.fontes;
    const c = {
      diag: analisar(S.pecas, fontes, { pinoDoPrograma: cena.programa === 'blink' ? '3' : null }),
      res: resolver(S.pecas, fontes),
      queimou: S.queimou,
      queimouAgora: false,
      pisca: false,
      fixoNo5V: false,
    };
    c.ligado = (x, y) => c.res.rede(x) === c.res.rede(y);

    const diagnosticos = [c.diag];
    if (cena.programa === 'blink') {
      const baixo = analisar(S.pecas, { ...fontes, 3: 0 });
      diagnosticos.push(baixo);
      if (baixo.codigo === 'curto') c.diag = baixo;
      c.pisca = (diagnosticos[0].codigo === 'aceso') !== (baixo.codigo === 'aceso');
      c.fixoNo5V = diagnosticos[0].codigo === 'aceso' && baixo.codigo === 'aceso';
    }

    const queima = diagnosticos.find((d) => d.codigo === 'queimou');
    if (queima && c.diag.codigo !== 'curto') {
      S.pecas.find((p) => p.tipo === 'led').queimado = true;
      S.queimou = true;
      c.queimou = true;
      c.queimouAgora = true;
      c.diag = queima;
      c.pisca = false;
      c.fixoNo5V = false;
    }
    return c;
  }

  function checarObjetivos(c) {
    const objs = S.cena.objetivos;
    let novo = null;
    if (S.cena.ordem) {
      while (S.objetivoIdx < objs.length && objs[S.objetivoIdx].teste(c)) {
        novo = objs[S.objetivoIdx];
        S.feitos.add(novo.id);
        S.objetivoIdx++;
      }
    } else {
      objs.forEach((o) => {
        if (!S.feitos.has(o.id) && o.teste(c)) {
          S.feitos.add(o.id);
          novo = o;
        }
      });
    }
    if (objs.every((o) => S.feitos.has(o.id))) S.completa = true;
    return novo;
  }

  // O aviso sai da frente quando o dedo encosta na placa. Um problema ainda sem
  // solução precisa voltar, senão o aluno fica sem saber o que está errado.
  function lembrarPendencia() {
    if (S.pendencia) avisar(S.pendencia.texto, S.pendencia.tom);
  }

  function comentar(c, novo) {
    S.pendencia = null;
    const problema = (texto, tom = 'alerta') => {
      S.pendencia = { texto, tom };
      avisar(texto, tom);
    };
    const d = c.diag;
    if (d.codigo === 'curto') return problema(textoDoCurto(d), 'erro');
    if (c.queimouAgora && !novo) return problema(textoQueimou(d), 'erro');
    if (novo) return avisar(typeof novo.ok === 'function' ? novo.ok(c) : novo.ok, novo.tom || 'bom');

    const especial = S.cena.aviso && S.cena.aviso(c);
    if (especial) return problema(especial);
    if (d.codigo === 'aceso') return avisar(`LED aceso, com ${miliamperes(d.i)} mA.`, 'bom');
    if (TEXTOS_DIAGNOSTICO[d.codigo]) return problema(TEXTOS_DIAGNOSTICO[d.codigo]);
    if (d.codigo === 'aberto' && todasColocadas()) return problema(textoDaFalta(d.falta));
    return undefined;
  }

  function aposMudanca() {
    if (S.cena.aula) {
      const c = avaliar();
      desenharEletrica();
      comentar(c, null);
      return;
    }
    if (S.cena.tipo !== 'montagem') {
      desenharEletrica();
      return;
    }
    const c = avaliar();
    const novo = S.completa ? null : checarObjetivos(c);
    desenharEletrica();
    comentar(c, novo);
    if (S.completa) {
      S.montagemFinal = S.pecas.filter(completa).map(descreverPeca);
    }
    desenharGuia();
    desenharBandeja();
    dicaDoMomento();
  }

  function descreverPeca(p) {
    if (p.tipo === 'led') return `LED: perna longa em ${nomeDoFuro(p.a)}, perna curta em ${nomeDoFuro(p.b)}`;
    if (p.tipo === 'resistor') return `Resistor: ${nomeDoFuro(p.a)} e ${nomeDoFuro(p.b)}`;
    return `Jumper ${p.cor}: ${nomeDoFuro(p.a)} e ${nomeDoFuro(p.b)}`;
  }

  /* ---------- Perguntas sem raio-X ---------- */

  function iniciarQuiz() {
    S.fila = [...S.cena.perguntas];
    S.totalPerguntas = S.fila.length;
    S.acertos = 0;
    proximaPergunta();
  }

  function proximaPergunta() {
    clearTimeout(S.timerQuiz);
    esconderAviso();
    limparMarcadas();
    $('gCorrente').innerHTML = '';
    definirRaiox(false);
    S.mostrarEntendi = false;
    S.respondida = false;
    if (!S.fila.length) {
      S.pergunta = null;
      S.completa = true;
      $('metas').textContent = '';
      desenharMarcas(null);
      desenharGuia();
      $('texto').textContent = 'Isso! Agora você enxerga o que está por baixo do plástico.';
      desenharBandeja();
      dicaDoMomento();
      return;
    }
    S.tipoPergunta = S.fila.shift();
    S.pergunta = PERGUNTAS[S.tipoPergunta]();
    desenharMarcas(null);
    desenharGuia();
    desenharBandeja();
    dicaDoMomento();
  }

  function corrigir(certo, furoTocado) {
    const q = S.pergunta;
    S.respondida = true;
    const faixas = [...new Set(q.marcas.map(faixaDe))];
    faixas.forEach((f) => marcarFaixa(f));
    desenharFluxos(faixas);
    if (certo) {
      S.acertos++;
      avisar(q.certo, 'bom');
      if (furoTocado) desenharMarcas(furoTocado, true);
      S.timerQuiz = setTimeout(proximaPergunta, 1900);
    } else {
      definirRaiox(true);
      if (furoTocado) {
        marcarFaixa(faixaDe(furoTocado), 'errada');
        desenharMarcas(furoTocado, false);
      }
      S.mostrarEntendi = true;
      S.fila.push(S.tipoPergunta); // volta depois, com outros furos
      avisar(q.errado, 'erro');
    }
    desenharGuia();
    desenharBandeja();
    dicaDoMomento();
  }

  /* ---------- Navegação ---------- */

  function criarPeca(modelo, fixa) {
    contadorPecas++;
    return {
      id: 'p' + contadorPecas,
      tipo: modelo.tipo,
      cor: modelo.cor,
      reserva: Boolean(modelo.reserva),
      fixa,
      a: fixa ? modelo.a : null,
      b: fixa ? modelo.b : null,
      queimado: false,
    };
  }

  function pararTudo() {
    clearInterval(S.timer);
    clearTimeout(S.timerQuiz);
    clearTimeout(S.timerQuadro);
    clearTimeout(S.timerRaiox);
    S.timer = null;
    S.arrasto = null;
    S.sonda = null;
  }

  function prepararPlaca(cena) {
    const montagem = cena.tipo === 'montagem';
    placa.setAttribute(
      'viewBox',
      montagem ? `0 ${-ALTURA_ARDUINO} ${LARGURA} ${ALTURA + ALTURA_ARDUINO}` : `0 0 ${LARGURA} ${ALTURA}`
    );
    $('gArduino').style.display = montagem ? '' : 'none';
    $('ledL').classList.remove('acesa');
    $('btRaiox').hidden = !montagem;
    $('linhaCodigo').hidden = cena.programa !== 'blink';
    $('gCorrente').innerHTML = '';
    $('lente').hidden = true;
    esconderAviso();
    limparMarcadas();
    desenharMarcas(null);
    definirRaiox(Boolean(cena.raiox));
    $('cena').classList.remove('foco');
    document.querySelector('.canaleta').classList.remove('cortada');
    $('app').classList.toggle('cena-animacao', cena.tipo === 'animacao');
  }

  function rodarBlink() {
    S.timer = setInterval(() => {
      S.pino3 = !S.pino3;
      desenharEletrica();
    }, 1000);
  }

  function iniciarCena() {
    pararTudo();
    const cena = S.etapa.cenas[S.cenaIdx];
    S.cena = cena;
    S.ativo = null;
    S.ultima = null;
    S.pendencia = null;
    S.objetivoIdx = 0;
    S.feitos = new Set();
    S.completa = false;
    S.queimou = false;
    S.pergunta = null;
    S.res = null;
    S.pino3 = true;
    S.pecas = [
      ...(cena.fixas || []).map((m) => criarPeca(m, true)),
      ...(cena.bandeja || []).map((m) => criarPeca(m, false)),
    ];

    prepararPlaca(cena);

    if (cena.tipo === 'animacao') {
      desenharEletrica();
      iniciarAnimacao();
      return;
    }
    if (cena.tipo === 'quiz') {
      desenharEletrica();
      iniciarQuiz();
      return;
    }
    if (cena.programa === 'blink') rodarBlink();
    aposMudanca();
    desenharGuia();
    desenharBandeja();
    dicaDoMomento();
  }

  function continuar() {
    if (S.cenaIdx < S.etapa.cenas.length - 1) {
      S.cenaIdx++;
      iniciarCena();
    } else if (S.etapa.bancada) {
      abrirBancada();
    } else {
      marcarConcluida(S.etapa.n);
      location.hash = `#etapa-${S.etapa.n + 1}`;
    }
  }

  function lerConcluidas() {
    try {
      return JSON.parse(localStorage.getItem('protoboard.concluidas')) || [];
    } catch (erro) {
      return [];
    }
  }

  function marcarConcluida(n) {
    try {
      const feitas = new Set(lerConcluidas());
      feitas.add(n);
      localStorage.setItem('protoboard.concluidas', JSON.stringify([...feitas]));
    } catch (erro) {
      // Sem armazenamento (aba anônima, por exemplo): só não guarda o progresso.
    }
  }

  function mostrar(tela) {
    ['menu', 'app', 'bancada', 'aulaTela', 'aulaSlide'].forEach((id) => {
      $(id).hidden = id !== tela;
    });
    window.scrollTo(0, 0);
  }

  function abrirMenu() {
    pararTudo();
    S.cena = null;
    const feitas = lerConcluidas();
    $('listaEtapas').innerHTML = ETAPAS.map((e) => {
      const concluida = feitas.includes(e.n);
      return `<li><a class="cartao-etapa ${concluida ? 'concluida' : ''}" href="#etapa-${e.n}">
        <span class="aro">${String(e.n).padStart(2, '0')}</span>
        <span><strong>${e.titulo}</strong><span class="resumo">${e.resumo}</span></span>
        ${concluida ? '<span class="feito">Feita</span>' : ''}
      </a></li>`;
    }).join('');
    document.title = 'Protoboard por dentro';
    mostrar('menu');
  }

  function abrirEtapa(etapa) {
    S.etapa = etapa;
    S.cenaIdx = 0;
    $('numeroEtapa').textContent = `Etapa ${etapa.n} de ${ETAPAS.length}`;
    $('tituloEtapa').textContent = etapa.titulo;
    document.title = `Etapa ${etapa.n}: ${etapa.titulo}`;
    mostrar('app');
    iniciarCena();
  }

  function abrirBancada() {
    pararTudo();
    const etapa = S.etapa;
    marcarConcluida(etapa.n);
    const { bancada } = etapa;
    $('bancadaEtapa').textContent = `Etapa ${etapa.n} concluída`;
    $('bancadaTitulo').textContent = bancada.titulo;
    $('bancadaItens').innerHTML = bancada.itens.map((t) => `<li><span>${t}</span></li>`).join('');
    $('bancadaMontagem').hidden = !bancada.montagem;
    $('bancadaPecas').innerHTML = S.montagemFinal.map((t) => `<li>${t}</li>`).join('');
    const proxima = ETAPAS[etapa.n];
    $('btProxima').textContent = proxima ? `Próxima: ${proxima.titulo}` : 'Ver todas as etapas';
    mostrar('bancada');
  }

  $('btProxima').addEventListener('click', () => {
    const proxima = ETAPAS[S.etapa.n];
    location.hash = proxima ? `#etapa-${proxima.n}` : '#inicio';
  });
  $('btRefazer').addEventListener('click', () => abrirEtapa(S.etapa));

  /* ---------- Aula: versão para o datashow ----------
   * O conteúdo está em roteiro.js. O instrutor avança pelo teclado ou pelo
   * passador de slides, que envia as teclas PageDown e PageUp.
   */

  const AJUDA_AULA = '→ avança · ← volta · R raio-X · F tela cheia · 1 a 5 muda de etapa. Dá para arrastar as pernas com o mouse.';

  function controlesDaAula(area) {
    area.textContent = '';
    const { idx, telas } = S.aula;
    const botao = (texto, classe, acao, desligado) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = classe;
      b.textContent = texto;
      b.disabled = Boolean(desligado);
      b.addEventListener('click', acao);
      area.appendChild(b);
    };
    botao('← Voltar', 'bt-secundario', () => irParaTela(S.aula.idx - 1), idx === 0);
    botao('Avançar →', 'bt-principal', () => irParaTela(S.aula.idx + 1), idx === telas.length - 1);
    botao('Tela cheia', 'bt-secundario', alternarTelaCheia);
  }

  function alternarTelaCheia() {
    const pedido = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    if (pedido) pedido.catch(() => {});
  }

  function mostrarDemonstracao(t) {
    const comPecas = Boolean(t.pecas);
    S.etapa = t.etapa;
    S.cena = {
      tipo: comPecas ? 'montagem' : 'animacao',
      aula: true,
      fontes: t.fontes || {},
      programa: t.programa,
      objetivos: [],
    };
    S.ativo = null;
    S.ultima = null;
    S.pendencia = null;
    S.completa = false;
    S.queimou = false;
    S.res = null;
    S.pino3 = true;
    S.pecas = (t.pecas || []).map((m) => ({ ...criarPeca(m, false), a: m.a, b: m.b }));

    mostrar('app');
    prepararPlaca(S.cena);
    if (comPecas) {
      avaliar(); // quem queima o LED é o circuito, não o roteiro
      definirRaiox(Boolean(t.raiox));
      desenharEletrica();
    } else {
      desenharEletrica();
      pintarQuadro(t);
    }
    if (t.programa === 'blink') rodarBlink();

    const daEtapa = S.aula.telas.filter((x) => x.tipo === 'demo' && x.etapa === t.etapa);
    const atual = daEtapa.indexOf(t);
    const metas = $('metas');
    metas.className = 'metas passos-curtos';
    metas.innerHTML = daEtapa
      .map((_, i) => `<li class="${i < atual ? 'feita' : i === atual ? 'atual' : ''}"></li>`)
      .join('');

    $('numeroEtapa').textContent = `Etapa ${t.etapa.n} de ${ETAPAS.length}`;
    $('tituloEtapa').textContent = t.etapa.titulo;
    $('texto').textContent = t.texto;
    dicaDoMomento();
    controlesDaAula($('bandeja'));
  }

  function comBibliotecaDeQR(acao) {
    if (window.QR) {
      acao();
      return;
    }
    const carregar = (arquivo, depois) => {
      const script = document.createElement('script');
      script.src = arquivo;
      script.onload = depois;
      document.head.appendChild(script);
    };
    carregar('qrcode.js', () => carregar('qr.js', acao));
  }

  function desenharQrDaAula(n) {
    const base = window.ENDERECO_DO_SITE;
    const canvas = $('aulaQr');
    canvas.hidden = !base;
    $('aulaEndereco').textContent = base ? '' : 'O QR code aparece aqui quando o site tiver um endereço público.';
    if (!base) return;
    comBibliotecaDeQR(() => {
      const url = window.QR.urlDaEtapa(base, n);
      canvas.width = 900;
      canvas.height = 900;
      window.QR.desenharQR(canvas.getContext('2d'), url, 0, 0, 900);
      $('aulaEndereco').textContent = url;
    });
  }

  function mostrarTelaCheiaDaAula(t) {
    S.cena = null;
    const { etapa } = t;
    const bancada = t.tipo === 'bancada';
    const posicao = `Etapa ${etapa.n} de ${ETAPAS.length}`;
    $('aulaTela').classList.toggle('com-qr', !bancada);
    $('aulaSobre').textContent = bancada ? posicao : `${posicao} · Agora é com você`;
    $('aulaTitulo').textContent = bancada ? etapa.bancada.titulo : etapa.titulo;
    $('aulaApoio').textContent = bancada ? '' : 'Aponte a câmera do celular para o QR code.';
    $('aulaItens').innerHTML = bancada ? etapa.bancada.itens.map((i) => `<li><span>${i}</span></li>`).join('') : '';
    $('aulaQrCaixa').hidden = bancada;
    if (!bancada) desenharQrDaAula(etapa.n);
    controlesDaAula($('aulaControles'));
    mostrar('aulaTela');
  }

  function mostrarSlide(t) {
    S.cena = null;
    const imagem = $('aulaSlideImagem');
    imagem.src = t.src;
    imagem.alt = `Slide ${t.numero} da apresentação`;
    $('aulaSlideDica').hidden = S.aula.idx !== 0;
    mostrar('aulaSlide');
  }

  // Se a página recarregar no meio da aula, ela volta para a mesma tela.
  function guardarTela(i) {
    try {
      sessionStorage.setItem('protoboard.aula', String(i));
    } catch (erro) {
      // Sem armazenamento: só recomeça do início se a página recarregar.
    }
  }

  function telaGuardada() {
    try {
      return Number(sessionStorage.getItem('protoboard.aula')) || 0;
    } catch (erro) {
      return 0;
    }
  }

  function irParaTela(i) {
    const { telas } = S.aula;
    if (i < 0 || i >= telas.length) return;
    S.aula.idx = i;
    guardarTela(i);
    pararTudo();
    const t = telas[i];
    document.title = t.etapa ? `Aula: ${t.etapa.titulo}` : 'Oficina de Arduino';
    if (t.tipo === 'demo') mostrarDemonstracao(t);
    else if (t.tipo === 'slide') mostrarSlide(t);
    else mostrarTelaCheiaDaAula(t);
  }

  // No slide não há botões: clicar à direita avança, e na ponta esquerda volta.
  $('aulaSlide').addEventListener('click', (e) => {
    irParaTela(S.aula.idx + (e.clientX < window.innerWidth * 0.25 ? -1 : 1));
  });

  window.addEventListener('keydown', (e) => {
    if (!S.aula || e.ctrlKey || e.altKey || e.metaKey) return;
    const tecla = e.key.toLowerCase();
    if (['arrowright', 'arrowdown', 'pagedown', ' ', 'enter'].includes(tecla)) {
      e.preventDefault();
      irParaTela(S.aula.idx + 1);
    } else if (['arrowleft', 'arrowup', 'pageup', 'backspace'].includes(tecla)) {
      e.preventDefault();
      irParaTela(S.aula.idx - 1);
    } else if (tecla === 'home') {
      e.preventDefault();
      irParaTela(0);
    } else if (tecla === 'end') {
      e.preventDefault();
      irParaTela(S.aula.telas.length - 1);
    } else if (tecla === 'f') {
      alternarTelaCheia();
    } else if (tecla === 'r' && S.cena && S.cena.tipo === 'montagem') {
      $('btRaiox').click();
    } else if (/^[1-5]$/.test(tecla)) {
      irParaTela(S.aula.telas.findIndex((t) => t.etapa && t.etapa.n === Number(tecla)));
    }
  });

  function rotear() {
    const aula = Boolean(window.APRESENTACAO) || location.hash === '#aula';
    document.body.classList.toggle('modo-aula', aula);
    if (aula) {
      S.aula = { telas: window.ROTEIRO, idx: 0 };
      irParaTela(Math.min(telaGuardada(), S.aula.telas.length - 1));
      return;
    }
    S.aula = null;
    const m = /^#etapa-(\d+)$/.exec(location.hash);
    const etapa = m && ETAPAS[Number(m[1]) - 1];
    if (etapa) abrirEtapa(etapa);
    else abrirMenu();
  }

  montarPlaca();
  window.addEventListener('hashchange', rotear);
  rotear();
})();
