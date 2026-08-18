/*
 * export-word.js — Genera documentos de Word (.doc) a partir de HTML.
 *
 * Word abre perfectamente archivos .doc con contenido HTML + estilos en línea,
 * conservando tablas, títulos y formato. Es 100% offline y no requiere librerías.
 * Devuelve un Blob que se puede descargar y/o guardar en la carpeta de datos.
 */

// Envuelve el cuerpo HTML en un documento Word válido.
// opciones (todas opcionales): { size, margin, font, fontSize } para personalizar la página.
export function construirDocWord(tituloDoc, cuerpoHTML, opciones = {}) {
  const size = opciones.size || "21cm 29.7cm";
  const margin = opciones.margin || "2.5cm 2.5cm 2.5cm 3cm";
  const font = opciones.font || '"Times New Roman", serif';
  const fontSize = opciones.fontSize || "12pt";
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${escapar(tituloDoc)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>
    @page { size: ${size}; margin: ${margin}; }
    body { font-family: ${font}; font-size: ${fontSize}; color: #000; }
    h1 { font-size: 15pt; text-align: center; margin: 0 0 2pt; }
    h2 { font-size: 13pt; text-align: center; margin: 0 0 10pt; font-weight: bold; }
    .encabezado { text-align: center; margin-bottom: 14pt; }
    .encabezado .unidad { font-weight: bold; text-transform: uppercase; }
    table { border-collapse: collapse; width: 100%; font-size: 11pt; }
    table, th, td { border: 1px solid #000; }
    th, td { padding: 4pt 6pt; }
    th { background: #d9d9d9; text-align: center; }
    td.num, th.num { text-align: center; }
    tfoot td { font-weight: bold; background: #eee; }
    .firma { margin-top: 48pt; text-align: center; }
    .firma .linea { border-top: 1px solid #000; width: 220pt; margin: 0 auto 4pt; }
    .obs { margin-top: 12pt; }
    .der { text-align: right; }
    .small { font-size: 10pt; }
  </style>
</head>
<body>
${cuerpoHTML}
</body>
</html>`;
}

export function blobWord(tituloDoc, cuerpoHTML, opciones) {
  const html = construirDocWord(tituloDoc, cuerpoHTML, opciones);
  return new Blob(["﻿", html], { type: "application/msword" });
}

// Descarga el Blob con el nombre dado.
export function descargar(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function escapar(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
