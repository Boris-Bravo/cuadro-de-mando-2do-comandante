/*
 * docparser.js — Lector de documentos de Office (.docx, .xlsx, .pptx) en el navegador.
 *
 * Los formatos de Office son archivos ZIP que contienen XML. Aquí se lee el ZIP
 * usando SOLO APIs nativas del navegador (sin librerías externas):
 *   - Se parsea la estructura ZIP (directorio central) manualmente.
 *   - Se descomprime cada parte con DecompressionStream("deflate-raw").
 *   - Se extrae el texto y algunos datos de formato con DOMParser.
 *
 * Esto mantiene la app 100% offline y sin dependencias.
 */

/* ---------- Lector ZIP mínimo ---------- */
async function inflarRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Devuelve un mapa { nombreArchivo: Uint8Array } de las entradas del ZIP.
export async function leerZip(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const n = dv.byteLength;

  // Buscar End Of Central Directory (firma 0x06054b50) desde el final.
  let eocd = -1;
  for (let i = n - 22; i >= 0 && i > n - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP no válido (sin EOCD)");

  const totalEntradas = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true); // offset del directorio central

  const salida = {};
  for (let e = 0; e < totalEntradas; e++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break; // firma entrada central
    const metodo = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const fnLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const nombre = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + fnLen));

    // Ir a la cabecera local para calcular el inicio real de los datos.
    const lfnLen = dv.getUint16(localOff + 26, true);
    const lextraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lfnLen + lextraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);

    try {
      salida[nombre] = metodo === 0 ? comp.slice() : await inflarRaw(comp);
    } catch (err) {
      // Entrada ilegible: se omite.
    }
    ptr += 46 + fnLen + extraLen + commentLen;
  }
  return salida;
}

function textoDe(bytesU8) { return bytesU8 ? new TextDecoder("utf-8").decode(bytesU8) : ""; }
function parseXML(txt) { return new DOMParser().parseFromString(txt, "application/xml"); }
function local(nodo) { return nodo.localName || nodo.nodeName.replace(/^.*:/, ""); }

/* ---------- Extracción por tipo ---------- */

// .docx → { tipo, parrafos:[], texto, formato:{ fuente, tamanoPt, margenes } }
async function parseDocx(zip) {
  const doc = parseXML(textoDe(zip["word/document.xml"]));
  const parrafos = [];
  // Recorrer párrafos <w:p>
  const ps = [...doc.getElementsByTagName("*")].filter((n) => local(n) === "p");
  for (const p of ps) {
    const runs = [...p.getElementsByTagName("*")].filter((n) => local(n) === "t");
    const txt = runs.map((r) => r.textContent).join("");
    parrafos.push(txt);
  }
  // Formato: primera fuente y tamaño encontrados
  let fuente = "", tamanoPt = 0;
  const rFonts = [...doc.getElementsByTagName("*")].find((n) => local(n) === "rFonts");
  if (rFonts) fuente = rFonts.getAttribute("w:ascii") || rFonts.getAttribute("ascii") || "";
  const sz = [...doc.getElementsByTagName("*")].find((n) => local(n) === "sz");
  if (sz) tamanoPt = (parseInt(sz.getAttribute("w:val") || sz.getAttribute("val")) || 0) / 2;
  // Márgenes (pgMar) en twips (1 cm ≈ 567 twips)
  let margenes = null;
  const pgMar = [...doc.getElementsByTagName("*")].find((n) => local(n) === "pgMar");
  if (pgMar) {
    const g = (a) => (parseInt(pgMar.getAttribute("w:" + a) || pgMar.getAttribute(a)) || 0) / 567;
    margenes = { superior: g("top"), inferior: g("bottom"), izquierdo: g("left"), derecho: g("right") };
  }
  const texto = parrafos.join("\n");
  return { tipo: "docx", parrafos, texto, formato: { fuente, tamanoPt, margenes } };
}

// .xlsx → { tipo, texto, hojas:[{nombre, celdas}] } (texto de cadenas compartidas)
async function parseXlsx(zip) {
  const shared = [];
  if (zip["xl/sharedStrings.xml"]) {
    const ss = parseXML(textoDe(zip["xl/sharedStrings.xml"]));
    [...ss.getElementsByTagName("*")].filter((n) => local(n) === "si").forEach((si) => {
      const ts = [...si.getElementsByTagName("*")].filter((n) => local(n) === "t").map((t) => t.textContent).join("");
      shared.push(ts);
    });
  }
  const textos = [...shared];
  const texto = textos.join("\n");
  return { tipo: "xlsx", texto, cadenas: shared };
}

// .pptx → { tipo, texto, diapositivas:[texto] }
async function parsePptx(zip) {
  const slides = Object.keys(zip).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort();
  const diapositivas = [];
  for (const s of slides) {
    const xml = parseXML(textoDe(zip[s]));
    const t = [...xml.getElementsByTagName("*")].filter((n) => local(n) === "t").map((n) => n.textContent).join(" ");
    diapositivas.push(t);
  }
  return { tipo: "pptx", texto: diapositivas.join("\n\n"), diapositivas };
}

/* ---------- API pública ---------- */
export async function extraerDocumento(file) {
  const nombre = (file.name || "").toLowerCase();
  const buf = await file.arrayBuffer();
  const zip = await leerZip(buf);
  if (nombre.endsWith(".docx")) return await parseDocx(zip);
  if (nombre.endsWith(".xlsx")) return await parseXlsx(zip);
  if (nombre.endsWith(".pptx")) return await parsePptx(zip);
  throw new Error("Formato no soportado. Usa .docx, .xlsx o .pptx");
}
