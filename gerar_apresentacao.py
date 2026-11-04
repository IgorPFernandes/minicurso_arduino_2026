"""
Junta os slides do PDF e o simulador em um único arquivo HTML.

O resultado (Minicurso_Arduino_2026.html) funciona sozinho: não precisa de internet
nem de nenhum outro arquivo ao lado. Rode de novo sempre que mudar um texto do site
ou o PDF da apresentação:

    python gerar_apresentacao.py

Precisa da biblioteca PyMuPDF (pip install pymupdf). O slide pessoal é uma página
HTML em slides-extras: quando ela muda, o Edge a transforma em imagem de novo, e
para isso é preciso internet, por causa das fontes.
"""
import base64
import json
import subprocess
import tempfile
import time
from pathlib import Path

import fitz

PASTA = Path(__file__).resolve().parent
PDF = PASTA.parent / 'Minicurso_arduino2025.pdf'
SAIDA = PASTA / 'Minicurso_Arduino_2026.html'
SLIDE_PESSOAL = PASTA / 'slides-extras' / 'quem-sou-eu.html'
IMAGEM_DO_SLIDE_PESSOAL = SLIDE_PESSOAL.with_suffix('.jpg')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

LARGURA_DO_SLIDE = 1920  # pixels
QUALIDADE_JPEG = 82
CORTE_X = 4.5  # pontos do PDF, mantendo a proporção 16:9
CORTE_Y = CORTE_X * 9 / 16


def em_data_url(jpeg):
    return 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode('ascii')


def renderizar_slide_pessoal():
    imagem = IMAGEM_DO_SLIDE_PESSOAL
    if imagem.exists() and imagem.stat().st_mtime >= SLIDE_PESSOAL.stat().st_mtime:
        return
    with tempfile.TemporaryDirectory() as pasta:
        png = Path(pasta) / 'slide.png'
        subprocess.run(
            [EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
             f'--user-data-dir={pasta}/perfil', '--window-size=1920,1080', '--virtual-time-budget=6000',
             f'--screenshot={png}', SLIDE_PESSOAL.as_uri()],
            capture_output=True, timeout=90,
        )
        # O msedge.exe devolve o controle antes de terminar: a resposta é o arquivo aparecer.
        for _ in range(80):
            if png.exists() and png.stat().st_size > 0:
                break
            time.sleep(0.5)
        else:
            raise SystemExit('O Edge não gerou a imagem do slide pessoal.')
        time.sleep(0.5)
        imagem.write_bytes(fitz.Pixmap(str(png)).tobytes(output='jpeg', jpg_quality=QUALIDADE_JPEG))
        time.sleep(1)  # o Edge ainda pode estar soltando a pasta temporária


def slides_do_pdf():
    documento = fitz.open(PDF)
    imagens = []
    for pagina in documento:
        # O PDF exportado tem um fio branco nas bordas, que apareceria em tela cheia.
        recorte = pagina.rect + (CORTE_X, CORTE_Y, -CORTE_X, -CORTE_Y)
        escala = LARGURA_DO_SLIDE / recorte.width
        pixels = pagina.get_pixmap(matrix=fitz.Matrix(escala, escala), clip=recorte, alpha=False)
        jpeg = pixels.tobytes(output='jpeg', jpg_quality=QUALIDADE_JPEG)
        imagens.append(em_data_url(jpeg))
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
    renderizar_slide_pessoal()
    slides = slides_do_pdf()
    slides.insert(1, em_data_url(IMAGEM_DO_SLIDE_PESSOAL.read_bytes()))  # logo depois da capa
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
