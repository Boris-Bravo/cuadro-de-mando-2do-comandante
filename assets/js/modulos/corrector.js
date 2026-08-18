/*
 * corrector.js — Módulo "Revisor de Documentación".
 *
 * Revisa documentos Word/Excel/PowerPoint (.docx/.xlsx/.pptx):
 *   - OFFLINE (siempre): extrae texto y formato con docparser.js y aplica reglas
 *     de ortografía/tipografía, estructura de correspondencia militar y comparación
 *     contra FORMATOS de referencia que el usuario cargue.
 *   - CON IA (si hay internet + clave): revisión profunda de fondo, forma y formato
 *     contra el Reglamento de Correspondencia Militar y el formato seleccionado.
 *   - INFORME: genera un documento Word o una imagen con los errores de forma y
 *     ortografía, para devolver al oficial que entregó el documento.
 *
 * La clave de API, las reglas, el reglamento y los formatos se guardan en corrector.json.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { extraerDocumento } from "../docparser.js";
import { blobWord, descargar, escapar } from "../export-word.js";

const ARCHIVO = "corrector";
const MODELO = "claude-opus-4-8";

function ajustesDef() {
  return {
    apiKey: "",
    reglamento: "",
    formatos: [],
    fuentes: ["Times New Roman", "Arial"],
    tamano: 12,
    margenes: { min: 2.0, max: 4.0 },
    claves: {
      membrete: true,
      asunto: ["ASUNTO", "ASUNTO:"],
      referencia: ["REF", "REFERENCIA", "REF."],
      despedida: ["Atentamente", "Dios guarde", "Es cuanto", "Respetuosamente", "Con las consideraciones"],
    },
  };
}

const ERRORES_COMUNES = {
  "aver": "a ver / haber", "osea": "o sea", "porfavor": "por favor", "aveces": "a veces",
  "enserio": "en serio", "deacuerdo": "de acuerdo", "atravez": "a través", "através": "a través",
  "nisiquiera": "ni siquiera", "apesar": "a pesar", "haci": "así", "asi": "así",
  "solamete": "solamente", "tambien": "también", "numero": "número", "mas": "más (si es cantidad)",
  "esta": "está (si es verbo)", "porque": "por qué / porqué (según caso)", "sino": "si no (según caso)",
};

let ctx, cont, datos, ultimoDoc = null, ultimoAnalisis = null, formatoSel = "";

export async function correctorModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || { ajustes: ajustesDef() };
  if (!datos.ajustes) datos.ajustes = ajustesDef();
  if (!datos.ajustes.formatos) datos.ajustes.formatos = [];
  ultimoAnalisis = null;
  render();
}
async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

/* ================= RENDER ================= */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "✍️ Revisor de Documentación"),
      h("div", { class: "sub" }, "Revisa ortografía y formato de tus documentos Word, Excel y PowerPoint")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--ghost", onclick: abrirFormatos }, "📁 Formatos"),
      h("button", { class: "btn btn--ghost", onclick: abrirAjustes }, "⚙️ Reglas / IA"))));

  // Estado de las referencias de revisión
  const regOk = ((datos.ajustes.reglamento || "").length > 200);
  cont.appendChild(h("div", { class: "chips", style: "margin-bottom:14px" },
    h("span", { class: "chip", style: "cursor:default" },
      regOk ? "✅ Reglamento de Correspondencia Militar cargado" : "⚠️ Reglamento no cargado"),
    h("span", { class: "chip", style: "cursor:default" },
      `📁 ${datos.ajustes.formatos.length} formato(s) de referencia`)));

  // Selector de formato de referencia
  const sel = h("select", { onchange: (e) => { formatoSel = e.target.value; } },
    h("option", { value: "" }, "— Sin comparar con formato —"),
    ...datos.ajustes.formatos.map((f) => h("option", { value: f.id, selected: f.id === formatoSel }, f.nombre)));
  cont.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field", style: "flex:1 1 260px" }, h("label", {}, "Comparar con formato de referencia"), sel)));

  // Zona de carga
  const input = h("input", { type: "file", accept: ".docx,.xlsx,.pptx", style: "display:none",
    onchange: (e) => { const f = e.target.files[0]; if (f) analizar(f); } });
  cont.appendChild(h("div", { class: "panel", style: "text-align:center;padding:34px;border:2px dashed var(--linea)" },
    h("div", { style: "font-size:44px" }, "📄"),
    h("h3", { style: "border:none;justify-content:center;margin:8px 0" }, "Carga un documento para revisar"),
    h("p", { class: "muted" }, "Formatos: .docx (Word), .xlsx (Excel), .pptx (PowerPoint)"),
    h("label", { class: "btn btn--primary", style: "cursor:pointer" }, "📎 Seleccionar documento", input)));

  cont.appendChild(h("div", { id: "resultado" }));
}

/* ================= ANÁLISIS ================= */
async function analizar(file) {
  const res = document.getElementById("resultado");
  limpiar(res);
  res.appendChild(h("div", { class: "panel" }, h("p", { class: "muted" }, "⏳ Leyendo el documento…")));

  let doc;
  try {
    doc = await extraerDocumento(file);
    ultimoDoc = { doc, nombre: file.name };
  } catch (e) {
    console.error(e);
    limpiar(res).appendChild(h("div", { class: "panel" },
      h("p", { style: "color:var(--rojo)" }, "No se pudo leer el documento: " + (e.message || e))));
    return;
  }

  const formato = datos.ajustes.formatos.find((f) => f.id === formatoSel) || null;
  const hallazgos = revisarOffline(doc, formato);
  ultimoAnalisis = { nombre: file.name, doc, hallazgos, formato, iaTexto: null };
  pintarResultado(file.name, doc, hallazgos);
}

function revisarOffline(doc, formato) {
  const H = [];
  const texto = doc.texto || "";
  const aj = datos.ajustes;

  if (doc.tipo === "docx") {
    const f = doc.formato || {};
    if (f.fuente) {
      const ok = aj.fuentes.some((x) => f.fuente.toLowerCase().includes(x.toLowerCase()));
      H.push(ok
        ? aviso("ok", "Fuente", `Usa "${f.fuente}", permitida.`)
        : aviso("aviso", "Fuente", `Usa "${f.fuente}". El reglamento sugiere: ${aj.fuentes.join(" o ")}.`));
    }
    if (f.tamanoPt) {
      H.push(Math.abs(f.tamanoPt - aj.tamano) <= 1
        ? aviso("ok", "Tamaño de letra", `${f.tamanoPt} pt, correcto.`)
        : aviso("aviso", "Tamaño de letra", `${f.tamanoPt} pt. Debería ser ${aj.tamano} pt.`));
    }
    if (f.margenes) {
      const m = f.margenes;
      const fuera = ["superior", "inferior", "izquierdo", "derecho"].filter((k) => m[k] && (m[k] < aj.margenes.min || m[k] > aj.margenes.max));
      H.push(fuera.length === 0
        ? aviso("ok", "Márgenes", `Dentro del rango (${aj.margenes.min}–${aj.margenes.max} cm).`)
        : aviso("aviso", "Márgenes", `Revisar: ${fuera.map((k) => `${k} ${m[k].toFixed(1)} cm`).join(", ")}. Rango: ${aj.margenes.min}–${aj.margenes.max} cm.`));
    }

    const P = (doc.parrafos || []).filter((p) => p.trim());
    const primera = P[0] || "";
    if (aj.claves.membrete) {
      const esMembrete = primera && primera === primera.toUpperCase() && primera.length > 4;
      H.push(esMembrete
        ? aviso("ok", "Membrete", "El documento inicia con membrete/encabezado en mayúsculas.")
        : aviso("aviso", "Membrete", "No se detecta un membrete institucional en mayúsculas al inicio."));
    }
    H.push(contiene(texto, aj.claves.referencia)
      ? aviso("ok", "Referencia", "Incluye referencia (Ref.).")
      : aviso("aviso", "Referencia", "No se detecta una línea de referencia (Ref.)."));
    H.push(contiene(texto, aj.claves.asunto)
      ? aviso("ok", "Asunto", "Incluye la línea de ASUNTO.")
      : aviso("aviso", "Asunto", "No se detecta la línea de ASUNTO."));
    H.push(/\b\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\b/i.test(texto) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(texto) || /\d{6}-[A-Z]{3}-\d{2}/.test(texto)
      ? aviso("ok", "Fecha", "Incluye lugar y fecha.")
      : aviso("aviso", "Fecha", "No se detecta una fecha con formato claro."));
    H.push(contiene(texto, aj.claves.despedida)
      ? aviso("ok", "Despedida / antefirma", "Incluye fórmula de despedida.")
      : aviso("aviso", "Despedida / antefirma", "No se detecta fórmula de despedida (Atentamente, Dios guarde…)."));
  }

  // Comparación contra el formato de referencia seleccionado
  H.push(...compararFormato(doc, formato));

  // Ortografía / tipografía (todos los formatos)
  H.push(...revisarTipografia(texto));
  H.push(...revisarOrtografia(texto));

  if (H.filter((x) => x.nivel !== "ok").length === 0) {
    H.push(aviso("ok", "General", "No se detectaron problemas evidentes en la revisión offline."));
  }
  return H;
}

// Compara la estructura del documento contra las etiquetas del formato de referencia.
function compararFormato(doc, formato) {
  const H = [];
  if (!formato || !formato.texto) return H;
  const texto = (doc.texto || "").toUpperCase();
  const labels = (formato.texto || "").split("\n").map((s) => s.trim()).filter(Boolean)
    .map((s) => { const i = s.indexOf(":"); return i > 0 && i <= 30 ? s.slice(0, i).trim() : null; })
    .filter((l) => l && l.length >= 2 && l.length <= 30);
  const uniq = [...new Set(labels.map((l) => l.toUpperCase()))].slice(0, 25);
  if (!uniq.length) {
    H.push(aviso("ok", "Formato de referencia", `Comparado con "${formato.nombre}".`));
    return H;
  }
  const faltan = uniq.filter((l) => !texto.includes(l));
  if (!faltan.length) H.push(aviso("ok", "Estructura vs formato", `Contiene los elementos del formato "${formato.nombre}".`));
  else faltan.slice(0, 10).forEach((l) => H.push(aviso("aviso", "Falta según formato", `No se encontró "${l}:" (formato "${formato.nombre}").`)));
  return H;
}

function revisarTipografia(texto) {
  const H = [];
  const lineas = texto.split(/\n/);
  let dobles = 0, espPunt = 0, faltaEsp = 0, dobPunt = 0;
  lineas.forEach((l) => {
    if (/ {2,}/.test(l)) dobles++;
    if (/\s+[,.;:]/.test(l)) espPunt++;
    if (/[,.;:][a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(l)) faltaEsp++;
    if (/([,.;:!?])\1/.test(l)) dobPunt++;
  });
  if (dobles) H.push(aviso("aviso", "Espacios dobles", `${dobles} línea(s) con espacios dobles.`));
  if (espPunt) H.push(aviso("aviso", "Espacio antes de puntuación", `${espPunt} caso(s) de espacio antes de , . ; :`));
  if (faltaEsp) H.push(aviso("aviso", "Falta espacio", `${faltaEsp} caso(s) sin espacio después de puntuación.`));
  if (dobPunt) H.push(aviso("aviso", "Puntuación repetida", `${dobPunt} caso(s) de signos de puntuación duplicados.`));
  return H;
}

function revisarOrtografia(texto) {
  const H = [];
  const palabras = (texto.toLowerCase().match(/[a-záéíóúñ]+/gi) || []);
  const encontrados = {};
  for (const p of palabras) if (ERRORES_COMUNES[p]) encontrados[p] = (encontrados[p] || 0) + 1;
  const claves = Object.keys(encontrados);
  if (claves.length) {
    claves.slice(0, 15).forEach((p) => {
      H.push(aviso("aviso", "Posible error ortográfico", `"${p}" (×${encontrados[p]}) → ${ERRORES_COMUNES[p]}`));
    });
  }
  return H;
}

function aviso(nivel, titulo, detalle) { return { nivel, titulo, detalle }; }
function contiene(texto, lista) { const t = texto.toLowerCase(); return (lista || []).some((k) => t.includes(k.toLowerCase())); }
function contarNiveles(H) { return { err: H.filter((x) => x.nivel === "error").length, avi: H.filter((x) => x.nivel === "aviso").length, ok: H.filter((x) => x.nivel === "ok").length }; }

/* ================= RESULTADO ================= */
function pintarResultado(nombre, doc, H) {
  const res = limpiar(document.getElementById("resultado"));
  const c = contarNiveles(H);

  res.appendChild(h("div", { class: "page-head", style: "margin-top:6px" },
    h("div", {},
      h("h2", { style: "font-size:19px" }, `Resultado: ${nombre}`),
      h("div", { class: "sub" }, `Tipo: ${doc.tipo.toUpperCase()}  ·  ${doc.texto ? doc.texto.length : 0} caracteres analizados`)),
    h("div", { class: "chips" },
      h("span", { class: "chip", style: "cursor:default" }, h("b", { style: "color:var(--rojo-claro)" }, String(c.err)), " errores"),
      h("span", { class: "chip", style: "cursor:default" }, h("b", { style: "color:#ffca6e" }, String(c.avi)), " observaciones"),
      h("span", { class: "chip", style: "cursor:default" }, h("b", { style: "color:#7ff0ad" }, String(c.ok)), " correctos"))));

  res.appendChild(h("div", { class: "btn-row" },
    h("button", { class: "btn btn--gold", onclick: revisarConIA }, "🌐 Revisión profunda con IA"),
    h("button", { class: "btn btn--primary", onclick: generarInformeWord }, "📄 Informe (Word)"),
    h("button", { class: "btn btn--primary", onclick: generarInformeImagen }, "🖼️ Informe (imagen)"),
    h("button", { class: "btn btn--ghost", onclick: () => verTexto(doc) }, "👁️ Ver texto extraído")));

  const panel = h("div", { class: "panel" }, h("h3", {}, "Revisión offline (formato y ortografía)"));
  const lista = h("div", { class: "list" });
  const orden = { error: 0, aviso: 1, ok: 2 };
  H.slice().sort((a, b) => orden[a.nivel] - orden[b.nivel]).forEach((x) => {
    const color = x.nivel === "error" ? "var(--rojo)" : x.nivel === "aviso" ? "#ffca6e" : "#7ff0ad";
    const icono = x.nivel === "error" ? "❌" : x.nivel === "aviso" ? "⚠️" : "✅";
    lista.appendChild(h("div", { class: "list-item", style: `border-left:4px solid ${color}` },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, `${icono} ${x.titulo}`),
        h("span", { class: "list-item__meta" }, x.detalle))));
  });
  panel.appendChild(lista);
  res.appendChild(panel);
  res.appendChild(h("div", { id: "resultadoIA" }));
}

function verTexto(doc) {
  modal({
    titulo: "Texto extraído",
    cuerpo: h("pre", { style: "white-space:pre-wrap;max-height:60vh;overflow:auto;font-size:13px;background:var(--panel-2);padding:12px;border-radius:8px" }, doc.texto || "(sin texto)"),
    acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null }],
  });
}

/* ================= INFORME (Word / imagen) ================= */
function generarInformeWord() {
  const a = ultimoAnalisis;
  if (!a) { toast("Primero revisa un documento", "err"); return; }
  const c = contarNiveles(a.hallazgos);
  const filas = a.hallazgos.slice().sort((x, y) => ({ error: 0, aviso: 1, ok: 2 })[x.nivel] - ({ error: 0, aviso: 1, ok: 2 })[y.nivel])
    .map((x) => {
      const et = x.nivel === "error" ? "ERROR" : x.nivel === "aviso" ? "OBSERVACIÓN" : "CORRECTO";
      return `<tr><td>${et}</td><td>${escapar(x.titulo)}</td><td>${escapar(x.detalle)}</td></tr>`;
    }).join("");
  const cuerpo = `
    <div class="encabezado"><h2>INFORME DE REVISIÓN DE DOCUMENTO</h2>
    <div>Documento: ${escapar(a.nombre)}</div><div>Fecha: ${escapar(fechaLarga(fechaHoy()))}</div></div>
    <p><b>Resumen:</b> ${c.err} error(es), ${c.avi} observación(es), ${c.ok} correcto(s).${a.formato ? ` Comparado con el formato: <b>${escapar(a.formato.nombre)}</b>.` : ""}</p>
    <table><thead><tr><th style="width:16%">Nivel</th><th style="width:26%">Aspecto</th><th>Detalle / corrección sugerida</th></tr></thead><tbody>${filas}</tbody></table>
    ${a.iaTexto ? `<div class="obs"><b>REVISIÓN DETALLADA (IA):</b><br>${escapar(a.iaTexto).replace(/\n/g, "<br>")}</div>` : ""}
    <p class="small" style="margin-top:16pt">Generado por el Revisor de Documentación — Cuadro de Mando y Control 2C.</p>`;
  const blob = blobWord("Informe de revisión", cuerpo);
  const nombre = `Informe_${(a.nombre || "documento").replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_")}.doc`;
  descargar(blob, nombre);
  try {
    if (ctx.store.estado().modo === "carpeta") { ctx.store.guardarArchivo("Informes", nombre, blob); toast("Informe guardado en la carpeta “Informes”", "ok"); }
    else toast("Informe descargado", "ok");
  } catch { toast("Informe descargado", ""); }
}

function generarInformeImagen() {
  const a = ultimoAnalisis;
  if (!a) { toast("Primero revisa un documento", "err"); return; }
  const W = 1000, pad = 44, lineH = 30;
  const canvas = document.createElement("canvas");
  const m = canvas.getContext("2d");
  const c = contarNiveles(a.hallazgos);

  const items = [];
  items.push({ txt: "INFORME DE REVISIÓN", font: 'bold 30px "Segoe UI",sans-serif', color: "#e6c85a" });
  items.push({ txt: a.nombre, font: '16px "Segoe UI",sans-serif', color: "#bcd4c8", gap: 6, wrap: true });
  items.push({ txt: `${c.err} errores · ${c.avi} observaciones · ${c.ok} correctos`, font: '15px "Segoe UI",sans-serif', color: "#9fb0a0", gap: 6 });
  items.push({ sep: true });
  a.hallazgos.slice().sort((x, y) => ({ error: 0, aviso: 1, ok: 2 })[x.nivel] - ({ error: 0, aviso: 1, ok: 2 })[y.nivel]).forEach((x) => {
    const ic = x.nivel === "error" ? "✕" : x.nivel === "aviso" ? "!" : "✓";
    const col = x.nivel === "error" ? "#ff7a72" : x.nivel === "aviso" ? "#ffca6e" : "#7ff0ad";
    items.push({ txt: `${ic}  ${x.titulo}`, font: 'bold 17px "Segoe UI",sans-serif', color: col, gap: 12 });
    items.push({ txt: x.detalle, font: '15px "Segoe UI",sans-serif', color: "#dfe6df", wrap: true, gap: 2 });
  });

  const wrapLines = (text, font) => {
    m.font = font; const words = String(text).split(" "); const lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (m.measureText(t).width > W - pad * 2) { if (cur) lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  };
  let y = pad; const draw = [];
  for (const it of items) {
    if (it.sep) { y += 6; draw.push({ sep: true, y }); y += 16; continue; }
    y += it.gap || 0;
    const lines = it.wrap ? wrapLines(it.txt, it.font) : [it.txt];
    for (const ln of lines) { draw.push({ txt: ln, font: it.font, color: it.color, y }); y += lineH; }
  }
  const HT = y + pad;
  canvas.width = W; canvas.height = HT;
  const g = canvas.getContext("2d");
  g.fillStyle = "#0c131a"; g.fillRect(0, 0, W, HT);
  g.fillStyle = "#2f6b5f"; g.fillRect(0, 0, 6, HT);
  g.textBaseline = "top";
  for (const d of draw) {
    if (d.sep) { g.strokeStyle = "rgba(120,200,170,.3)"; g.beginPath(); g.moveTo(pad, d.y); g.lineTo(W - pad, d.y); g.stroke(); continue; }
    g.font = d.font; g.fillStyle = d.color; g.fillText(d.txt, pad, d.y);
  }
  canvas.toBlob((b) => {
    descargar(b, `Informe_${(a.nombre || "doc").replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_")}.png`);
    toast("Informe (imagen) descargado", "ok");
  }, "image/png");
}

/* ================= REVISIÓN CON IA ================= */
async function revisarConIA() {
  const cont2 = limpiar(document.getElementById("resultadoIA"));
  if (!navigator.onLine) {
    cont2.appendChild(h("div", { class: "panel" }, h("p", { style: "color:#ffca6e" }, "⚠️ Sin conexión a internet. La revisión con IA requiere datos móviles o WiFi.")));
    return;
  }
  const key = (datos.ajustes.apiKey || "").trim();
  if (!key) {
    cont2.appendChild(h("div", { class: "panel" },
      h("p", {}, "Para la revisión con IA necesitas configurar tu clave de API de Claude."),
      h("button", { class: "btn btn--primary", onclick: abrirAjustes }, "⚙️ Configurar clave")));
    return;
  }
  if (!ultimoDoc) return;
  cont2.appendChild(h("div", { class: "panel" }, h("p", { class: "muted" }, "🌐 Consultando a la IA… (puede tardar unos segundos)")));

  const reglas = datos.ajustes.reglamento
    ? `REGLAS DEL REGLAMENTO DE CORRESPONDENCIA MILITAR a considerar:\n"""\n${datos.ajustes.reglamento.slice(0, 60000)}\n"""\n\n` : "";
  const formato = ultimoAnalisis && ultimoAnalisis.formato;
  const refFormato = formato
    ? `FORMATO DE REFERENCIA (el documento debe ajustarse a esta estructura y forma):\n"""\n${(formato.texto || "").slice(0, 8000)}\n"""\n\n` : "";

  const prompt = `Eres un asesor experto en correspondencia militar. Revisa el siguiente documento (${ultimoDoc.nombre}) en cuanto a FONDO (ortografía, gramática, redacción, claridad) y FORMA (estructura y formato según correspondencia militar: membrete, referencia, asunto, cuerpo, despedida/antefirma, tono formal).

${reglas}${refFormato}Devuelve tu respuesta en español, organizada así:
1) ERRORES DE ORTOGRAFÍA Y GRAMÁTICA (lista con la corrección)
2) OBSERVACIONES DE REDACCIÓN Y CLARIDAD
3) FORMATO Y ESTRUCTURA (qué cumple y qué falta según el reglamento y el formato de referencia)
4) VERSIÓN CORREGIDA SUGERIDA (si aplica)

DOCUMENTO:
"""
${(ultimoDoc.doc.texto || "").slice(0, 12000)}
"""`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: MODELO, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { const txt = await r.text(); throw new Error(`API ${r.status}: ${txt.slice(0, 200)}`); }
    const data = await r.json();
    const texto = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n") || "(sin respuesta)";
    if (ultimoAnalisis) ultimoAnalisis.iaTexto = texto;
    limpiar(cont2).appendChild(h("div", { class: "panel", style: "border-top:3px solid var(--oro)" },
      h("h3", {}, "🌐 Revisión con IA"),
      h("div", { style: "white-space:pre-wrap;line-height:1.55" }, texto),
      h("p", { class: "muted small", style: "margin-top:10px" }, "Esta revisión ya se incluirá en el Informe (Word).")));
    toast("Revisión con IA completada", "ok");
  } catch (e) {
    console.error(e);
    limpiar(cont2).appendChild(h("div", { class: "panel" },
      h("p", { style: "color:var(--rojo)" }, "No se pudo completar la revisión con IA."),
      h("p", { class: "muted small" }, String(e.message || e)),
      h("p", { class: "muted small" }, "Verifica tu clave de API y tu conexión.")));
  }
}

/* ================= FORMATOS DE REFERENCIA ================= */
function abrirFormatos() {
  const cuerpo = h("div", {});
  const lista = h("div", { class: "list" });
  function pintar() {
    limpiar(lista);
    if (!datos.ajustes.formatos.length) lista.appendChild(h("p", { class: "muted", style: "text-align:center;padding:10px" }, "Sin formatos. Carga uno (.docx) para comparar."));
    datos.ajustes.formatos.forEach((f) => {
      lista.appendChild(h("div", { class: "list-item", style: "padding:8px 12px" },
        h("div", { class: "list-item__main" },
          h("span", { class: "list-item__title" }, f.nombre),
          h("span", { class: "list-item__meta" }, `${(f.texto || "").length} caracteres · ${escapar(f.nombreOriginal || "")}`)),
        h("button", { class: "btn btn--danger btn--sm", onclick: async () => { datos.ajustes.formatos = datos.ajustes.formatos.filter((x) => x.id !== f.id); await persistir(); pintar(); } }, "🗑️")));
    });
  }
  pintar();
  const nombre = h("input", { type: "text", placeholder: "Nombre del formato (ej.: Radiograma, Oficio…)" });
  const file = h("input", { type: "file", accept: ".docx,.xlsx,.pptx", style: "display:none",
    onchange: async (e) => {
      const fl = e.target.files[0]; if (!fl) return;
      try {
        const doc = await extraerDocumento(fl);
        const texto = (doc.texto || "").slice(0, 40000);
        if (!nombre.value.trim()) nombre.value = fl.name.replace(/\.[^.]+$/, "");
        datos.ajustes.formatos.push({ id: idNuevo(), nombre: nombre.value.trim() || fl.name, texto, nombreOriginal: fl.name });
        await persistir(); nombre.value = ""; pintar(); toast("Formato cargado", "ok");
      } catch (err) { console.error(err); toast("No se pudo leer el formato", "err"); }
    } });
  cuerpo.append(lista,
    h("div", { class: "form-row mt", style: "align-items:flex-end" },
      h("div", { class: "field" }, h("label", {}, "Nombre"), nombre),
      h("label", { class: "btn btn--primary", style: "cursor:pointer" }, "📎 Cargar formato", file)),
    h("p", { class: "muted small" }, "Los formatos que cargues se usan para comparar la estructura de los documentos revisados y como referencia para la IA."));
  modal({ titulo: "📁 Formatos de referencia", cuerpo, acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null, onClick: () => render() }] });
}

/* ================= AJUSTES (reglas / IA / reglamento) ================= */
function abrirAjustes() {
  const aj = datos.ajustes;
  const key = h("input", { type: "password", value: aj.apiKey || "", placeholder: "sk-ant-..." });
  const fuentes = h("input", { type: "text", value: (aj.fuentes || []).join(", ") });
  const tamano = h("input", { type: "number", value: aj.tamano, min: "8", max: "18" });
  const mMin = h("input", { type: "number", step: "0.1", value: aj.margenes.min });
  const mMax = h("input", { type: "number", step: "0.1", value: aj.margenes.max });
  const regl = h("textarea", { rows: "5", placeholder: "Reglas clave del Reglamento de Correspondencia Militar. La IA las usará al revisar." }, aj.reglamento || "");

  const estadoRegl = ((aj.reglamento || "").length > 200)
    ? h("p", { class: "muted small", style: "color:#7ff0ad;margin:0 0 8px" }, `✅ Reglamento cargado (${aj.reglamento.length} caracteres).`)
    : h("p", { class: "muted small", style: "color:#ffca6e;margin:0 0 8px" }, "⚠️ Reglamento no cargado. Pega abajo sus reglas clave.");

  const cuerpo = h("div", {},
    h("h3", { style: "margin:0 0 8px;font-size:14px;color:var(--verde-700)" }, "Revisión con IA"),
    h("div", { class: "field", style: "margin-bottom:6px" }, h("label", {}, "Clave de API de Claude"), key),
    h("p", { class: "muted small", style: "margin:0 0 14px" }, "Se guarda solo en este equipo. Necesaria para la revisión profunda con IA (requiere internet)."),
    h("h3", { style: "margin:8px 0;font-size:14px;color:var(--verde-700)" }, "Reglas de formato (offline)"),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Fuentes permitidas (separadas por coma)"), fuentes),
      h("div", { class: "field", style: "flex:0 0 120px" }, h("label", {}, "Tamaño (pt)"), tamano)),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Margen mínimo (cm)"), mMin),
      h("div", { class: "field" }, h("label", {}, "Margen máximo (cm)"), mMax)),
    h("h3", { style: "margin:8px 0;font-size:14px;color:var(--verde-700)" }, "Reglamento de Correspondencia Militar"),
    estadoRegl,
    h("div", { class: "field" }, regl));

  modal({
    titulo: "⚙️ Reglas y configuración de IA",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      { texto: "💾 Guardar", clase: "btn--primary", valor: "ok", onClick: () => {
        aj.apiKey = key.value.trim();
        aj.fuentes = fuentes.value.split(",").map((s) => s.trim()).filter(Boolean);
        aj.tamano = parseInt(tamano.value) || 12;
        aj.margenes = { min: parseFloat(mMin.value) || 2, max: parseFloat(mMax.value) || 4 };
        aj.reglamento = regl.value.trim();
        persistir().then(() => { toast("Configuración guardada", "ok"); render(); });
      } },
    ],
  });
}
