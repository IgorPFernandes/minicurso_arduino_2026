"""
Junta os slides do PDF e o simulador em um único arquivo HTML.

O resultado (Minicurso_Arduino_2026.html) funciona sozinho: não precisa de internet
nem de nenhum outro arquivo ao lado. Rode de novo sempre que mudar um texto do site
ou o PDF da apresentação:

    python gerar_apresentacao.py

Precisa da biblioteca PyMuPDF (pip install pymupdf).
"""
import base64
import json
from pathlib import Path

import fitz

PASTA = Path(__file__).resolve().parent
PDF = PASTA.parent / 'Minicurso_arduino2025.pdf'
SAIDA = PASTA / 'Minicurso_Arduino_2026.html'

LARGURA_DO_SLIDE = 1920  # pixels
QUALIDADE_JPEG = 82
CORTE_X = 4.5  # pontos do PDF, mantendo a proporção 16:9
CORTE_Y = CORTE_X * 9 / 16


def slides_do_pdf():
    documento = fitz.open(PDF)
    imagens = []
    for pagina in documento:
        # O PDF exportado tem um fio branco nas bordas, que apareceria em tela cheia.
        recorte = pagina.rect + (CORTE_X, CORTE_Y, -CORTE_X, -CORTE_Y)
        escala = LARGURA_DO_SLIDE / recorte.width
        pixels = pagina.get_pixmap(matrix=fitz.Matrix(escala, escala), clip=recorte, alpha=False)
        jpeg = pixels.tobytes(output='jpeg', jpg_quality=QUALIDADE_JPEG)
        imagens.append('data:image/jpeg;base64,' + base64.b64encode(jpeg).decode('ascii'))
    return imagens


def ler(nome):
    return (PASTA / nome).read_text(encoding='utf-8')


def script(conteudo):
    # Um "</script" dentro do código encerraria a tag antes da hora.
    return '<script>' + conteudo.replace('</script', '<\\/script') + '</script>'


def trocar(html, procurado, novo):
    assert procurado in html, procurado
    return html.replace(procurado, novo)


def gerar():
    slides = slides_do_pdf()
    html = ler('index.html')
    html = trocar(html, '<link rel="stylesheet" href="estilo.css">', '<style>' + ler('estilo.css') + '</style>')
    html = trocar(html, '<title>Protoboard por dentro</title>', '<title>Workshop de Arduino</title>')

    inicio = (
        script('window.APRESENTACAO = true; window.SLIDES = ' + json.dumps(slides) + ';')
        + script(ler('qrcode.js'))
        + script(ler('qr.js'))
    )
    html = trocar(html, '<script src="circuito.js"></script>', inicio + script(ler('circuito.js')))
    for arquivo in ('etapas.js', 'roteiro.js', 'app.js'):
        html = trocar(html, f'<script src="{arquivo}"></script>', script(ler(arquivo)))

    SAIDA.write_text(html, encoding='utf-8')
    print(f'{len(slides)} slides em {SAIDA.name}: {SAIDA.stat().st_size / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    gerar()
