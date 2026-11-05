"""
Tira o inglês dos slides. Trabalha na cópia em memória, nunca no PDF original.

Ficam em inglês só os nomes que precisam ser digitados assim no código (digitalWrite,
HIGH, INPUT...), as siglas e os termos sem tradução usada na área (pull-up, pull-down).
"""
import subprocess
import tempfile
import time
import urllib.parse
from pathlib import Path

import cv2
import fitz

PASTA = Path(__file__).resolve().parent / 'slides-extras'
POPPINS = PASTA / 'Poppins-Light.ttf'
PAGINA_DE_TITULO = PASTA / 'titulo.html'
PASTA_DE_TITULOS = PASTA / 'titulos'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

BRANCO = (1, 1, 1)
MARGEM_DO_BRILHO = 110  # pixels em volta das letras na imagem do título

ESQUERDA = 'esquerda'
CENTRO = 'centro'
JUSTIFICADO = 'justificado'

# Títulos que no PDF são imagens: (slide, imagens antigas, novas peças).
# Posições em pontos do slide (1440 x 810), medidas nas letras originais.
TITULOS = [
    (1, [36, 33], [
        dict(arquivo='oficina', texto='OFICINA', centro_x=513, centro_y=412, altura=100),
        dict(arquivo='ministrado', texto='Ministrado por Igor Pereira Fernandes', tipo='assinatura',
             centro_x=505, centro_y=536, altura=24),
    ]),
    (16, [174], [
        dict(arquivo='escopo', texto='ESCOPO DO|PROJETO', x0=163, centro_y=408, largura=540),
    ]),
    (19, [210], [
        dict(arquivo='resultados', texto='RESULTADOS E CONQUISTAS', centro_x=715, centro_y=214, largura=860),
    ]),
    (20, [218], [
        dict(arquivo='obrigado', texto='OBRIGADO!', x0=138, centro_y=348, altura=80),
    ]),
]

# Parágrafos reescritos por inteiro: (slide, área, corpo, entrelinha, alinhamento, texto).
PARAGRAFOS = [
    (3, (81, 213, 720, 442), 20.9, 28.6, JUSTIFICADO,
     'O Arduino foi criado em 2005 por Massimo Banzi e outros membros do Interaction Design Institute '
     'Ivrea, na Itália, com o objetivo de fornecer uma plataforma de prototipagem acessível e flexível '
     'para estudantes e projetistas. A ideia surgiu da necessidade de uma placa de código aberto que '
     'fosse fácil de programar e adaptável a diversos projetos. Desde então, o Arduino tornou-se uma '
     'ferramenta popular entre criadores, educadores e profissionais de várias áreas.'),
    (3, (81, 565, 948, 680), 20.9, 28.7, JUSTIFICADO,
     'Atualmente, o Arduino é amplamente utilizado em diversas aplicações, como automação residencial, '
     'robótica, prototipagem de dispositivos eletrônicos e projetos educacionais. Sua versatilidade '
     'permite criar soluções personalizadas para Internet das Coisas (IoT), monitoramento ambiental, '
     'vestíveis e muito mais.'),
    (7, (629, 629, 1320, 742), 18.5, 29.2, JUSTIFICADO,
     'Diferente da varredura, que consome processamento constante e pode ser ineficiente, as '
     'interrupções permitem que o Arduino responda imediatamente a eventos sem a necessidade de '
     'verificações contínuas, otimizando o uso do processador para outras tarefas simultâneas.'),
    (11, (629, 330, 1250, 648), 18.5, 28.9, ESQUERDA,
     'O potenciômetro é um resistor variável que ajusta a tensão de saída conforme seu eixo é girado ou '
     'deslizado, atuando como um divisor de tensão. Ele possui três terminais, onde o cursor móvel varia '
     'a proporção entre os extremos, sendo útil para controlar intensidades, como brilho de LED ou volume '
     'de som. Já o LDR (resistor dependente de luz) é um sensor cuja resistência diminui em ambientes '
     'claros e aumenta no escuro, respondendo à intensidade de luz. O LDR é frequentemente usado com um '
     'divisor de tensão para gerar sinais analógicos, permitindo medir níveis de luminosidade no Arduino. '
     'Ambos componentes são amplamente empregados em projetos de automação e interatividade.'),
    (13, (629, 444, 1320, 529), 18.5, 29.2, JUSTIFICADO,
     'A taxa de transmissão define a velocidade em bits por segundo. O padrão 9600 bps significa que '
     '9600 bits são transmitidos/recebidos por segundo, e ambos os dispositivos devem usar o mesmo valor.'),
    (13, (629, 629, 1320, 713), 18.5, 29.2, JUSTIFICADO,
     'Serial.begin() inicializa a comunicação serial configurando a taxa de transmissão. Serial.print() '
     'envia dados (texto, números, etc.) pela porta serial para monitoramento ou comunicação com outro '
     'dispositivo.'),
]

# Trocas em uma linha só: (slide, trecho antigo, trecho novo, alinhamento).
LINHAS = [
    (4, 'Pinos I/O', 'Pinos E/S', CENTRO),
    (7, 'Polling', 'Varredura', CENTRO),
    (7, 'interrupções sobre polling', 'interrupções sobre varredura', CENTRO),
    (8, 'modos de trigger', 'modos de disparo', CENTRO),
    (8, 'modos de ativação (trigger)', 'modos de ativação (disparo)', ESQUERDA),
    (13, 'Baud rate:', 'Velocidade:', CENTRO),
    (17, 'Integre o hardware e o software', 'Integre a montagem e o código', ESQUERDA),
    (19, 'Serial Plotter', 'Plotter Serial', JUSTIFICADO),
]


def renderizar_titulo(arquivo, texto, tipo='titulo'):
    PASTA_DE_TITULOS.mkdir(exist_ok=True)
    destino = PASTA_DE_TITULOS / f'{arquivo}.png'
    if destino.exists() and destino.stat().st_mtime >= PAGINA_DE_TITULO.stat().st_mtime:
        return destino
    consulta = urllib.parse.urlencode({'texto': texto, 'tipo': tipo})
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as pasta:
        png = Path(pasta) / 'titulo.png'
        subprocess.run(
            [EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={pasta}/perfil',
             '--default-background-color=00000000', '--window-size=5200,1500', '--virtual-time-budget=6000',
             f'--screenshot={png}', f'{PAGINA_DE_TITULO.as_uri()}?{consulta}'],
            capture_output=True, timeout=90,
        )
        for _ in range(80):
            if png.exists() and png.stat().st_size > 0:
                break
            time.sleep(0.5)
        else:
            raise SystemExit(f'O Edge não gerou o título {texto}.')
        time.sleep(1)
        imagem = cv2.imread(str(png), cv2.IMREAD_UNCHANGED)

    # Recorta nas letras, guardando a mesma margem de brilho em todos os títulos.
    ys, xs = (imagem[..., 3] > 240).nonzero()
    m = MARGEM_DO_BRILHO
    recorte = imagem[max(0, ys.min() - m):ys.max() + 1 + m, max(0, xs.min() - m):xs.max() + 1 + m]
    cv2.imwrite(str(destino), recorte)
    return destino


def colocar_titulo(pagina, peca):
    png = renderizar_titulo(peca['arquivo'], peca['texto'], peca.get('tipo', 'titulo'))
    altura_px, largura_px = cv2.imread(str(png), cv2.IMREAD_UNCHANGED).shape[:2]
    letras_l = largura_px - 2 * MARGEM_DO_BRILHO
    letras_a = altura_px - 2 * MARGEM_DO_BRILHO
    escala = peca['altura'] / letras_a if 'altura' in peca else peca['largura'] / letras_l
    meia_a = altura_px * escala / 2
    if 'x0' in peca:
        esquerda = peca['x0'] - MARGEM_DO_BRILHO * escala
    else:
        esquerda = peca['centro_x'] - largura_px * escala / 2
    ret = fitz.Rect(esquerda, peca['centro_y'] - meia_a, esquerda + largura_px * escala, peca['centro_y'] + meia_a)
    pagina.insert_image(ret, filename=str(png), keep_proportion=False, overlay=True)


def achar_linha(pagina, trecho):
    for bloco in pagina.get_text('dict')['blocks']:
        for linha in bloco.get('lines', []):
            texto = ''.join(s['text'] for s in linha['spans'])
            if trecho in texto:
                return linha, texto.strip()
    raise ValueError(f'Texto não encontrado no slide: {trecho}')


def escrever_justificado(pagina, x, base, largura, texto, corpo, fonte):
    palavras = texto.split()
    medidas = [fonte.text_length(p, fontsize=corpo) for p in palavras]
    vao = (largura - sum(medidas)) / (len(palavras) - 1)
    for palavra, medida in zip(palavras, medidas):
        pagina.insert_text((x, base), palavra, fontsize=corpo, fontname='poppins', color=BRANCO)
        x += medida + vao


def quebrar_linhas(texto, largura, corpo, fonte):
    linhas, atual = [], ''
    for palavra in texto.split():
        tentativa = f'{atual} {palavra}'.strip()
        if atual and fonte.text_length(tentativa, fontsize=corpo) > largura:
            linhas.append(atual)
            atual = palavra
        else:
            atual = tentativa
    linhas.append(atual)
    return linhas


def escrever_paragrafo(pagina, numero, ret, corpo, entrelinha, alinhamento, texto, fonte):
    linhas = quebrar_linhas(texto, ret.width, corpo, fonte)
    if len(linhas) > round(ret.height / entrelinha):
        raise ValueError(f'O texto não coube no slide {numero}: {texto[:40]}')
    base = ret.y0 + fonte.ascender * corpo
    for i, linha in enumerate(linhas):
        if alinhamento == JUSTIFICADO and i < len(linhas) - 1:
            escrever_justificado(pagina, ret.x0, base, ret.width, linha, corpo, fonte)
        else:
            pagina.insert_text((ret.x0, base), linha, fontsize=corpo, fontname='poppins', color=BRANCO)
        base += entrelinha


def traduzir(documento):
    fonte = fitz.Font(fontfile=str(POPPINS))

    for numero, imagens, pecas in TITULOS:
        pagina = documento[numero - 1]
        for xref in imagens:
            pagina.delete_image(xref)
        for peca in pecas:
            colocar_titulo(pagina, peca)

    # Primeiro apaga tudo de cada slide, depois escreve: a remoção refaz o texto da página.
    escritas = {}
    for numero, area, corpo, entrelinha, alinhamento, texto in PARAGRAFOS:
        pagina = documento[numero - 1]
        ret = fitz.Rect(area)
        pagina.add_redact_annot(ret + (0, 3, 0, -3), fill=False)
        escritas.setdefault(numero, []).append(('paragrafo', ret, corpo, entrelinha, alinhamento, texto))

    for numero, antigo, novo, alinhamento in LINHAS:
        pagina = documento[numero - 1]
        linha, texto = achar_linha(pagina, antigo)
        ret = fitz.Rect(linha['bbox'])
        span = linha['spans'][0]
        pagina.add_redact_annot(ret + (0, 3, 0, -3), fill=False)
        escritas.setdefault(numero, []).append(
            ('linha', ret, span['size'], span['origin'][1], alinhamento, texto.replace(antigo, novo)))

    for numero, itens in escritas.items():
        pagina = documento[numero - 1]
        pagina.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )
        pagina.insert_font(fontname='poppins', fontfile=str(POPPINS))
        for tipo, ret, corpo, medida, alinhamento, texto in itens:
            if tipo == 'paragrafo':
                escrever_paragrafo(pagina, numero, ret, corpo, medida, alinhamento, texto, fonte)
            elif alinhamento == JUSTIFICADO:
                escrever_justificado(pagina, ret.x0, medida, ret.width, texto, corpo, fonte)
            else:
                largura = fonte.text_length(texto, fontsize=corpo)
                x = ret.x0 if alinhamento == ESQUERDA else (ret.x0 + ret.x1 - largura) / 2
                pagina.insert_text((x, medida), texto, fontsize=corpo, fontname='poppins', color=BRANCO)
