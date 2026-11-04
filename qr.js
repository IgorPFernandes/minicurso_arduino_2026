/* Desenha um QR code em um canvas. Usado pela aula no datashow e por qrcodes.html. */
(function (global) {
  'use strict';

  const ZONA_LIVRE = 4; // margem branca exigida pelo padrão do QR, em módulos

  function urlDaEtapa(base, n) {
    const limpa = encodeURI(base.trim().replace(/#.*$/, ''));
    return n ? `${limpa}#etapa-${n}` : limpa;
  }

  function desenharQR(c, url, x, y, lado) {
    const qr = global.qrcode(0, 'M'); // versão automática, correção de erro média
    qr.addData(url, 'Byte');
    qr.make();

    const modulos = qr.getModuleCount();
    const celula = Math.floor(lado / (modulos + ZONA_LIVRE * 2));
    const recuo = Math.floor((lado - celula * modulos) / 2);

    c.fillStyle = '#ffffff';
    c.fillRect(x, y, lado, lado);
    c.fillStyle = '#0b0f4a';
    for (let l = 0; l < modulos; l++) {
      for (let k = 0; k < modulos; k++) {
        if (qr.isDark(l, k)) c.fillRect(x + recuo + k * celula, y + recuo + l * celula, celula, celula);
      }
    }
  }

  global.QR = { urlDaEtapa, desenharQR };
})(window);
