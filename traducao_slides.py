"""
Ajusta os slides para esta edição: tira o inglês e o módulo de interrupção.
Trabalha na cópia em memória, nunca no PDF original.

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
import numpy as np

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
    (13, 'Baud rate:', 'Velocidade:', CENTRO),
    (17, 'Integre o hardware e o software', 'Integre a montagem e o código', ESQUERDA),
    (19, 'Serial Plotter', 'Plotter Serial', JUSTIFICADO),
]


# Interrupção é avançado demais para 2 horas: saem a teoria (7 e 8) e o Projeto II (9).
SLIDES_RETIRADOS = [7, 8, 9]

# Com isso os números andam uma casa. Os títulos renumerados reaproveitam imagens
# do próprio PDF, para continuar com a fonte original: (slide, imagem atual, imagem
# nova, posição da imagem nova).
PROJETOS_RENUMERADOS = [
    (12, 128, 98, (410, 0, 1030, 338)),  # Projeto III vira Projeto II
    (14, 149, 128, (393, 0, 1047, 338)),  # Projeto IV vira Projeto III
]

# Nos módulos, só o algarismo muda: (slide, imagem do título, imagem de onde vem o número).
MODULOS_RENUMERADOS = [
    (10, 112, 84),  # Módulo 3 vira Módulo 2
    (11, 120, 84),
    (13, 142, 112),  # Módulo 4 vira Módulo 3
]

SUMARIO = [
    (True, 'Introdução'),
    (True, 'Módulo 1: Entrada e Saída Digital'),
    (True, 'Módulo 2: Conversão Analógico-'),
    (False, 'Digital (ADC)'),
    (True, 'Módulo 3: Comunicação Serial'),
    (True, 'Módulo 4: Mini-Projeto Final'),
    (True, 'Revisão e Tira-Dúvidas'),
]
SUMARIO_X = 207
SUMARIO_PRIMEIRA_BASE = 377
SUMARIO_ENTRELINHA = 42.8
SUMARIO_CORPO = 30.6
SUMARIO_AREA = (170, 340, 780, 695)


def imagem_rgba(documento, xref):
    mascara = documento.extract_image(xref)['smask']
    cor = fitz.Pixmap(documento, xref)
    if cor.alpha or cor.n > 3:
        cor = fitz.Pixmap(fitz.csRGB, cor)
    junta = fitz.Pixmap(cor, fitz.Pixmap(documento, mascara))
    return np.frombuffer(junta.samples, dtype=np.uint8).reshape(junta.height, junta.width, 4).copy()


def png_de(rgba):
    return cv2.imencode('.png', cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))[1].tobytes()


def faixas_de_letras(rgba):
    # Devolve a altura da primeira linha de texto e as colunas de cada letra.
    letras = rgba[..., 3] > 225
    linhas = np.where(letras.any(axis=1))[0]
    quebras = np.where(np.diff(linhas) > 60)[0]  # o acento do Ó fica mais perto que isso
    fim = linhas[quebras[0]] if len(quebras) else linhas[-1]
    colunas = np.where(letras[linhas[0]:fim + 1].any(axis=0))[0]
    grupos = np.split(colunas, np.where(np.diff(colunas) > 4)[0] + 1)
    return linhas[0], fim, [(g[0], g[-1]) for g in grupos]


def trocar_algarismo(destino, origem):
    # Em MÓDULO N, as letras são M, Ó, D, U, L, O: o número é a sétima peça.
    topo_d, base_d, letras_d = faixas_de_letras(destino)
    topo_o, _, letras_o = faixas_de_letras(origem)
    meio = lambda a, b: (int(a) + int(b)) // 2
    x0_d, x1_d = meio(letras_d[5][1], letras_d[6][0]), meio(letras_d[6][1], letras_d[7][0])
    x0_o, x1_o = meio(letras_o[5][1], letras_o[6][0]), meio(letras_o[6][1], letras_o[7][0])
    largura = min(x1_d - x0_d, x1_o - x0_o)
    folga = 40  # inclui o brilho acima e abaixo do número
    altura = int(base_d) - int(topo_d) + 1 + 2 * folga
    y_d = int(topo_d) - folga
    y_o = int(topo_o) - folga
    novo_x_d = meio(x0_d, x1_d) - largura // 2
    novo_x_o = meio(x0_o, x1_o) - largura // 2
    destino[y_d:y_d + altura, novo_x_d:novo_x_d + largura] = origem[y_o:y_o + altura, novo_x_o:novo_x_o + largura]
    return destino


def ajustar_sumario(pagina):
    pagina.add_redact_annot(fitz.Rect(SUMARIO_AREA), fill=False)
    pagina.apply_redactions(
        images=fitz.PDF_REDACT_IMAGE_NONE,
        graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
        text=fitz.PDF_REDACT_TEXT_REMOVE,
    )
    pagina.insert_font(fontname='poppins', fontfile=str(POPPINS))
    base = SUMARIO_PRIMEIRA_BASE
    for com_marca, texto in SUMARIO:
        if com_marca:
            pagina.draw_circle((SUMARIO_X - 18, base - 10), 3.8, color=BRANCO, fill=BRANCO)
        pagina.insert_text((SUMARIO_X, base), texto, fontsize=SUMARIO_CORPO, fontname='poppins', color=BRANCO)
        base += SUMARIO_ENTRELINHA


def retirar_interrupcao(documento):
    # Lê antes de apagar: a imagem do Projeto III é usada e substituída ao mesmo tempo.
    projetos = [(n, atual, png_de(imagem_rgba(documento, nova)), ret) for n, atual, nova, ret in PROJETOS_RENUMERADOS]
    modulos = [
        (n, atual, png_de(trocar_algarismo(imagem_rgba(documento, atual), imagem_rgba(documento, origem))),
         documento[n - 1].get_image_rects(atual)[0])
        for n, atual, origem in MODULOS_RENUMERADOS
    ]
    for n, atual, png, ret in projetos + modulos:
        pagina = documento[n - 1]
        pagina.delete_image(atual)
        pagina.insert_image(fitz.Rect(ret), stream=png, keep_proportion=False, overlay=True)
    ajustar_sumario(documento[1])
    documento.delete_pages([n - 1 for n in SLIDES_RETIRADOS])


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

    retirar_interrupcao(documento)
