/*
 * radiograma.js — Módulo "Radiograma y Fotograma".
 *
 * 1) RADIOGRAMA: formulario con la estructura del formato oficial (membrete,
 *    código, unidad, ENTREGA DIRECTA, lugar/fecha DTG, AL, DEL, sección, texto,
 *    firma e iniciales) y exportación a Word respetando el formato exacto:
 *    página ~21.5×27.5 cm, márgenes sup/inf/der 2 cm e izq 3 cm, fuente Arial,
 *    cuerpo 12 pt justificado. Todo el contenido es editable.
 * 2) FOTOGRAMA: mosaico (collage) de hasta 5 fotos en una sola imagen.
 * 3) MENSAJES: plantillas para enviar por WhatsApp.
 * Todo se guarda en radiograma.json (borrador + historial de guardados).
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";

const ARCHIVO = "radiograma";
const OPTS_WORD = { size: "21.5cm 27.5cm", margin: "2cm 2cm 2cm 3cm", font: "Arial, sans-serif", fontSize: "12pt" };
const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function plantillasDef() {
  return [
    { id: idNuevo(), nombre: "Parte diario", texto: "PARTE DIARIO\nUnidad: {unidad}\nFecha: {fecha}\n\nSin novedad de importancia. Se adjunta fotograma." },
    { id: idNuevo(), nombre: "Reporte inmediato", texto: "REPORTE INMEDIATO\nUnidad: {unidad}\nFecha/Hora: {fecha}\n\nNovedad: \n\nSe adjunta registro fotográfico." },
  ];
}

function baseVacia() {
  return {
    ajustes: { plantillas: plantillasDef(), telefono: "", lugar: "La Paz", membrete: "COMANDO GENERAL DEL EJÉRCITO", unidad: "" },
    ultimo: null, historial: [],
  };
}

function camposDef() {
  const a = datos.ajustes;
  return {
    _id: null,
    membrete: a.membrete || "COMANDO GENERAL DEL EJÉRCITO",
    codigo: "", unidad: a.unidad || "", entrega: "ENTREGA DIRECTA",
    lugarFecha: "", al: "", del: "", seccion: "", texto: "",
    firmaNombre: "", firmaGrado: "", iniciales: "",
    incluirFoto: false, orientacion: "Vertical",
  };
}

let ctx, cont, datos;
let fotos = [];
let mosaicoBlob = null, mosaicoURL = null;
let tab = "radiograma";
let borrador = {};

export async function radiogramaModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || baseVacia();
  if (!datos.ajustes) datos.ajustes = baseVacia().ajustes;
  if (!datos.ajustes.plantillas) datos.ajustes.plantillas = plantillasDef();
  if (!datos.historial) datos.historial = [];
  fotos = []; mosaicoBlob = null; mosaicoURL = null;
  borrador = datos.ultimo ? { ...datos.ultimo } : camposDef();
  render();
}
async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

const R = {};
function snap() {
  const g = (o) => (o ? (o.type === "checkbox" ? o.checked : o.value) : undefined);
  ["membrete", "codigo", "unidad", "entrega", "lugarFecha", "al", "del", "seccion", "texto", "firmaNombre", "firmaGrado", "iniciales", "incluirFoto", "orientacion"]
    .forEach((k) => { const v = g(R[k]); if (v !== undefined) borrador[k] = v; });
}
function refrescar() { snap(); render(); }

/* =================== RENDER =================== */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "📡 Radiograma y Fotograma"),
      h("div", { class: "sub" }, "Formato oficial · mosaico de fotos · WhatsApp")),
    h("div", { class: "chips" },
      chipTab("radiograma", "📡 Radiograma"),
      chipTab("guardados", `🗂️ Guardados (${datos.historial.length})`),
      chipTab("plantillas", "💬 Plantillas"))));

  if (tab === "plantillas") renderPlantillas();
  else if (tab === "guardados") renderGuardados();
  else renderRadiograma();
}
function chipTab(id, txt) {
  return h("span", { class: `chip ${tab === id ? "active" : ""}`, onclick: () => { snap(); tab = id; render(); } }, txt);
}

/* =================== RADIOGRAMA =================== */
function renderRadiograma() {
  const u = borrador;

  // Membrete / encabezado
  const p1 = h("div", { class: "panel" }, h("h3", {}, "Membrete y encabezado"));
  R.membrete = inp("text", u.membrete);
  R.codigo = inp("text", u.codigo); R.codigo.placeholder = "Ej.: RI1SECPERS45906MAY24";
  R.unidad = h("textarea", { rows: "3", placeholder: 'Ej.:\nRI-1 "COLORADOS"\nESCOLTA PRESIDENCIAL\nBOLIVIA' }, u.unidad || "");
  R.entrega = inp("text", u.entrega);
  R.lugarFecha = inp("text", u.lugarFecha); R.lugarFecha.placeholder = "Ej.: La Paz, 060830-MAY-24";
  const btnDTG = h("button", { class: "btn btn--ghost btn--sm", onclick: () => { R.lugarFecha.value = dtgAhora(); } }, "🕒 DTG ahora");
  p1.append(
    h("div", { class: "form-row" }, campo("Membrete (línea superior izq.)", R.membrete), campo("Código (arriba derecha)", R.codigo)),
    h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Unidad (una línea por renglón)"), R.unidad)),
    h("div", { class: "form-row", style: "align-items:flex-end" },
      campo("Tipo de entrega", R.entrega),
      h("div", { class: "field" }, h("label", {}, "Lugar y fecha (DTG)"), R.lugarFecha),
      h("div", { class: "field", style: "flex:0 0 auto" }, h("label", { style: "visibility:hidden" }, "."), btnDTG)));
  cont.appendChild(p1);

  // Destinatario y referencia
  const p2 = h("div", { class: "panel" }, h("h3", {}, "Destinatario y referencia"));
  R.al = inp("text", u.al); R.al.placeholder = "Ej.: DEPARTAMENTO III – OPERACIONES.";
  R.del = inp("text", u.del); R.del.placeholder = 'Ej.: RI-1 "COLORADOS"';
  R.seccion = inp("text", u.seccion); R.seccion.placeholder = "Ej.: SEC. I PERS. N° 459/24.-";
  p2.append(
    h("div", { class: "form-row" }, campo("AL (destinatario)", R.al), campo("DEL (remite)", R.del)),
    h("div", { class: "form-row" }, campo("Sección / N.°", R.seccion)));
  cont.appendChild(p2);

  // Texto
  const p3 = h("div", { class: "panel" }, h("h3", {}, "Texto del radiograma"));
  const selPlantilla = h("select", {},
    h("option", { value: "" }, "— Cargar plantilla —"),
    ...datos.ajustes.plantillas.map((p) => h("option", { value: p.id }, p.nombre)));
  selPlantilla.addEventListener("change", () => {
    const p = datos.ajustes.plantillas.find((x) => x.id === selPlantilla.value);
    if (p) { R.texto.value = aplicarVariables(p.texto); selPlantilla.value = ""; }
  });
  R.texto = h("textarea", { rows: "6", placeholder: "Cuerpo del radiograma…" }, u.texto || "");
  p3.append(
    h("div", { class: "form-row" },
      h("div", { class: "field", style: "flex:0 0 240px" }, h("label", {}, "Plantilla"), selPlantilla),
      h("div", { class: "field", style: "flex:0 0 auto" }, h("label", { style: "visibility:hidden" }, "."),
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => { R.texto.value = (R.texto.value || "").toUpperCase(); } }, "🔠 MAYÚSCULAS"))),
    h("div", { class: "field" }, R.texto));
  cont.appendChild(p3);

  // Firma
  const p4 = h("div", { class: "panel" }, h("h3", {}, "Firma"));
  R.firmaNombre = inp("text", u.firmaNombre); R.firmaNombre.placeholder = "Nombre completo";
  R.firmaGrado = inp("text", u.firmaGrado); R.firmaGrado.placeholder = "Ej.: TENIENTE CORONEL DEM.";
  R.iniciales = inp("text", u.iniciales); R.iniciales.placeholder = "Ej.: FAB/JQA/jgv.";
  p4.append(
    h("div", { class: "form-row" }, campo("Nombre (firma)", R.firmaNombre), campo("Grado", R.firmaGrado)),
    h("div", { class: "form-row" }, campo("Iniciales (pie)", R.iniciales)));
  cont.appendChild(p4);

  // Fotograma
  cont.appendChild(renderFotograma());

  // Acciones
  cont.appendChild(h("div", { class: "btn-row" },
    h("button", { class: "btn btn--primary", onclick: guardar }, "💾 Guardar radiograma"),
    h("button", { class: "btn btn--gold", onclick: exportarWord }, "📄 Exportar a Word"),
    h("button", { class: "btn btn--ghost", onclick: enviarWhatsApp }, "📱 Enviar por WhatsApp"),
    h("button", { class: "btn btn--ghost", onclick: () => { snap(); if (confirmarNuevo()) {} } }, "🆕 Nuevo")));
}

function confirmarNuevo() {
  confirmar("¿Empezar un radiograma nuevo? Se limpiará el formulario (lo guardado permanece en Guardados).", { titulo: "Nuevo radiograma", textoOk: "Nuevo" })
    .then((ok) => { if (ok) { borrador = camposDef(); fotos = []; mosaicoBlob = null; mosaicoURL = null; render(); } });
  return false;
}

function renderFotograma() {
  const panel = h("div", { class: "panel" });
  panel.appendChild(h("div", { style: "display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px" },
    h("h3", { style: "margin:0;border:none;padding:0" }, "Fotograma (mosaico de fotos)"),
    h("span", { class: "muted small" }, `${fotos.length}/5 fotos`)));

  const input = h("input", { type: "file", accept: "image/*", multiple: true, style: "display:none",
    onchange: (e) => agregarFotos(e.target.files) });

  const thumbs = h("div", { class: "chips", style: "margin:12px 0" });
  fotos.forEach((f, i) => {
    thumbs.appendChild(h("div", { style: "position:relative" },
      h("img", { src: f.url, style: "width:74px;height:74px;object-fit:cover;border-radius:8px;border:1px solid var(--linea)" }),
      h("span", { style: "position:absolute;top:-6px;right:-6px;background:var(--rojo);color:#fff;border-radius:50%;width:20px;height:20px;display:grid;place-items:center;cursor:pointer;font-size:12px",
        onclick: () => { URL.revokeObjectURL(f.url); fotos.splice(i, 1); mosaicoBlob = null; refrescar(); } }, "✕")));
  });
  if (!fotos.length) thumbs.appendChild(h("span", { class: "muted" }, "Aún no hay fotos. Agrega hasta 5."));

  R.orientacion = sel(["Vertical", "Horizontal"], borrador.orientacion || "Vertical");
  R.incluirFoto = h("input", { type: "checkbox" }); if (borrador.incluirFoto) R.incluirFoto.checked = true;

  panel.append(
    thumbs,
    h("div", { class: "form-row", style: "align-items:flex-end" },
      h("label", { class: "btn btn--ghost", style: "cursor:pointer" }, "📷 Agregar fotos", input),
      h("div", { class: "field", style: "flex:0 0 150px" }, h("label", {}, "Orientación"), R.orientacion),
      h("button", { class: "btn btn--primary", onclick: generarMosaico, disabled: fotos.length === 0 }, "🖼️ Generar mosaico")),
    h("label", { style: "display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer;color:var(--texto-suave);font-size:13px" },
      R.incluirFoto, "Incluir el fotograma dentro del Word del radiograma"));

  const prev = h("div", { id: "mosaicoPrev", style: "margin-top:14px" });
  if (mosaicoURL) {
    prev.appendChild(h("img", { src: mosaicoURL, style: "max-width:100%;border-radius:10px;border:1px solid var(--linea);box-shadow:var(--sombra)" }));
    prev.appendChild(h("div", { class: "btn-row mt" },
      h("button", { class: "btn btn--ghost btn--sm", onclick: descargarMosaico }, "⬇️ Descargar fotograma")));
  }
  panel.appendChild(prev);
  return panel;
}

/* =================== FOTOS / MOSAICO =================== */
function agregarFotos(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    if (fotos.length >= 5) { toast("Máximo 5 fotos", "err"); break; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => refrescar();
    img.src = url;
    fotos.push({ file, img, url });
  }
  mosaicoBlob = null;
  refrescar();
}
function coverDraw(c, img, x, y, w, h2) {
  if (!img || !img.width) { c.fillStyle = "#e4e7d6"; c.fillRect(x, y, w, h2); return; }
  const ir = img.width / img.height, rr = w / h2;
  let sw, sh, sx, sy;
  if (ir > rr) { sh = img.height; sw = sh * rr; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / rr; sx = 0; sy = (img.height - sh) / 2; }
  c.drawImage(img, sx, sy, sw, sh, x, y, w, h2);
}
const LAYOUTS = {
  1: [[0, 0, 1, 1]],
  2: [[0, 0, 1, .5], [0, .5, 1, .5]],
  3: [[0, 0, 1, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
  4: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
  5: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .3333, .5], [.3333, .5, .3334, .5], [.6667, .5, .3333, .5]],
};
function construirMosaicoCanvas() {
  const horizontal = R.orientacion && R.orientacion.value === "Horizontal";
  const W = horizontal ? 1600 : 1200, H = horizontal ? 1200 : 1500, gap = 12;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
  const hb = Math.round(H * 0.072);
  c.fillStyle = "#2e3b1f"; c.fillRect(0, 0, W, hb);
  c.fillStyle = "#e6c85a"; c.textAlign = "center"; c.textBaseline = "middle";
  const titulo = primeraLinea(R.unidad && R.unidad.value) || "FOTOGRAMA";
  c.font = `bold ${Math.round(hb * 0.4)}px "Segoe UI", sans-serif`;
  c.fillText(titulo.toUpperCase(), W / 2, hb * 0.4);
  c.fillStyle = "#ffffff"; c.font = `${Math.round(hb * 0.26)}px "Segoe UI", sans-serif`;
  const sub = (R.lugarFecha && R.lugarFecha.value) || fechaLarga(fechaHoy());
  if (sub) c.fillText(sub, W / 2, hb * 0.75);
  const top = hb, cW = W, cH = H - top;
  const n = Math.min(fotos.length, 5) || 1;
  (LAYOUTS[n] || LAYOUTS[1]).forEach((r, idx) => {
    const x = Math.round(r[0] * cW) + gap / 2, y = top + Math.round(r[1] * cH) + gap / 2;
    const rw = Math.round(r[2] * cW) - gap, rh = Math.round(r[3] * cH) - gap;
    c.save(); c.beginPath(); c.rect(x, y, rw, rh); c.clip();
    coverDraw(c, fotos[idx] && fotos[idx].img, x, y, rw, rh);
    c.restore();
    c.strokeStyle = "#cfd3bf"; c.lineWidth = 3; c.strokeRect(x, y, rw, rh);
  });
  return canvas;
}
async function generarMosaico() {
  if (!fotos.length) { toast("Agrega al menos una foto", "err"); return; }
  await Promise.all(fotos.map((f) => f.img.complete ? Promise.resolve() : new Promise((res) => (f.img.onload = res))));
  const canvas = construirMosaicoCanvas();
  mosaicoBlob = await new Promise((res) => canvas.toBlob(res, "image/png", 0.92));
  if (mosaicoURL) URL.revokeObjectURL(mosaicoURL);
  mosaicoURL = URL.createObjectURL(mosaicoBlob);
  refrescar();
  toast("Fotograma generado", "ok");
}
function descargarMosaico() { if (mosaicoBlob) descargar(mosaicoBlob, `Fotograma_${fechaHoy()}.png`); }

/* =================== WHATSAPP =================== */
function textoParaEnvio() {
  snap();
  const b = borrador, partes = [];
  const enc = primeraLinea(b.unidad); if (enc) partes.push(enc);
  if (b.al) partes.push("AL: " + b.al);
  if (b.seccion) partes.push(b.seccion);
  const cab = partes.join("\n");
  return [cab, (b.texto || "").trim()].filter(Boolean).join("\n\n");
}
async function enviarWhatsApp() {
  const texto = textoParaEnvio();
  if (!texto && !mosaicoBlob) { toast("Escribe el texto o genera el fotograma", "err"); return; }
  await guardarSilencioso();
  if (mosaicoBlob && navigator.canShare) {
    const file = new File([mosaicoBlob], `Fotograma_${fechaHoy()}.png`, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: texto, title: "Radiograma" }); toast("Elige WhatsApp y confirma el envío", "ok"); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
  }
  const tel = (datos.ajustes.telefono || "").replace(/[^\d]/g, "");
  const url = `https://api.whatsapp.com/send?${tel ? "phone=" + tel + "&" : ""}text=${encodeURIComponent(texto)}`;
  if (mosaicoBlob) { descargar(mosaicoBlob, `Fotograma_${fechaHoy()}.png`); toast("Se descargó el fotograma: adjúntalo en WhatsApp", ""); }
  window.open(url, "_blank");
}

/* =================== EXPORTAR A WORD (formato oficial) =================== */
function construirCuerpoWord(b, dataURL) {
  const unidadLineas = (b.unidad || "").split("\n").filter((x) => x.trim()).map((x) => escapar(x)).join("<br>");
  return `
  <table style="width:100%;border:none;border-collapse:collapse;margin:0">
    <tr>
      <td style="border:none;padding:0;font-size:10pt;font-weight:bold;text-align:left;vertical-align:top;width:62%">${escapar(b.membrete)}</td>
      <td style="border:none;padding:0;font-size:10pt;text-align:right;vertical-align:top">${escapar(b.codigo)}</td>
    </tr>
  </table>
  <div style="font-size:10pt;font-weight:bold;margin-left:1cm;line-height:1.15;margin-top:2pt">${unidadLineas}</div>
  <p style="text-align:center;font-size:16pt;font-weight:bold;margin:14pt 0 10pt">${escapar(b.entrega)}</p>
  <p style="font-size:12pt;margin:4pt 0">${escapar(b.lugarFecha)}</p>
  <p style="font-size:12pt;margin:3pt 0"><b>AL:</b>&nbsp;&nbsp;${escapar(b.al)}</p>
  <p style="font-size:12pt;margin:3pt 0"><b>DEL:</b>&nbsp;&nbsp;${escapar(b.del)}</p>
  ${b.seccion ? `<p style="font-size:12pt;margin:3pt 0">${escapar(b.seccion)}</p>` : ""}
  <p style="text-align:justify;font-size:12pt;line-height:1.4;margin:12pt 0">${escapar(b.texto).replace(/\n/g, "<br>")}</p>
  <div style="text-align:center;font-size:12pt;margin-top:34pt">${escapar(b.firmaNombre)}<br><b>${escapar(b.firmaGrado)}</b></div>
  ${b.iniciales ? `<p style="font-size:12pt;margin-top:22pt">${escapar(b.iniciales)}</p>` : ""}
  ${(b.incluirFoto && dataURL) ? `<div style="text-align:center;margin-top:16pt;page-break-before:always"><b>FOTOGRAMA</b><br><img src="${dataURL}" style="width:15cm;max-width:100%"/></div>` : ""}`;
}
async function exportarWord() {
  snap();
  const b = borrador;
  const dataURL = (b.incluirFoto && mosaicoBlob) ? await blobADataURL(mosaicoBlob) : "";
  const blob = blobWord("Radiograma", construirCuerpoWord(b, dataURL), OPTS_WORD);
  const base = (b.seccion || b.codigo || fechaHoy()).replace(/[^\w.\-]+/g, "_") || "Radiograma";
  const nombre = `Radiograma_${base}.doc`;
  await guardarSilencioso();
  descargar(blob, nombre);
  try {
    if (ctx.store.estado().modo === "carpeta") { await ctx.store.guardarArchivo("Radiogramas", nombre, blob); toast("Exportado y guardado en la carpeta “Radiogramas”", "ok"); }
    else { toast("Radiograma exportado", "ok"); }
  } catch { toast("Radiograma exportado (descarga)", ""); }
}

/* =================== GUARDAR / HISTORIAL =================== */
async function guardarSilencioso() {
  snap();
  datos.ultimo = { ...borrador };
  datos.ajustes.unidad = borrador.unidad || datos.ajustes.unidad;
  datos.ajustes.membrete = borrador.membrete || datos.ajustes.membrete;
  await persistir();
}
async function guardar() {
  snap();
  if (!borrador._id) borrador._id = idNuevo();
  const registro = { ...borrador, _id: borrador._id, guardado: Date.now() };
  const idx = datos.historial.findIndex((x) => x._id === borrador._id);
  if (idx >= 0) datos.historial[idx] = registro; else datos.historial.push(registro);
  datos.ultimo = { ...borrador };
  await persistir();
  toast("Radiograma guardado", "ok");
  render();
}

function renderGuardados() {
  const panel = h("div", { class: "panel" }, h("h3", {}, "Radiogramas guardados"));
  const lista = h("div", { class: "list" });
  if (!datos.historial.length) {
    lista.appendChild(h("p", { class: "muted", style: "text-align:center;padding:14px" }, "Aún no hay radiogramas guardados. Usa “Guardar radiograma”."));
  }
  [...datos.historial].sort((a, b) => (b.guardado || 0) - (a.guardado || 0)).forEach((r) => {
    lista.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, r.seccion || primeraLinea(r.unidad) || "(radiograma)"),
        h("span", { class: "list-item__meta" }, `AL: ${r.al || "—"}  ·  ${new Date(r.guardado).toLocaleString("es")}`)),
      h("div", { class: "list-item__actions" },
        h("button", { class: "btn btn--primary btn--sm", onclick: () => { borrador = { ...r }; tab = "radiograma"; render(); toast("Radiograma cargado", "ok"); } }, "✏️ Abrir"),
        h("button", { class: "btn btn--gold btn--sm", onclick: () => { borrador = { ...r }; exportarWord(); } }, "📄 Word"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => borrarGuardado(r) }, "🗑️"))));
  });
  panel.appendChild(lista);
  cont.appendChild(panel);
}
async function borrarGuardado(r) {
  if (!await confirmar("¿Eliminar este radiograma guardado?", { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  datos.historial = datos.historial.filter((x) => x._id !== r._id);
  await persistir(); toast("Eliminado", ""); render();
}

/* =================== PLANTILLAS =================== */
function renderPlantillas() {
  const panel = h("div", { class: "panel" });
  panel.appendChild(h("div", { style: "display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px" },
    h("h3", { style: "margin:0;border:none;padding:0" }, "Mensajes predeterminados (WhatsApp)"),
    h("button", { class: "btn btn--primary btn--sm", onclick: () => editarPlantilla({ id: idNuevo(), nombre: "", texto: "" }, true) }, "＋ Nueva plantilla")));

  const tel = inp("text", datos.ajustes.telefono || "");
  tel.placeholder = "Ej.: 59170000000 (código país sin +)";
  tel.addEventListener("change", async () => { datos.ajustes.telefono = tel.value.trim(); await persistir(); });
  panel.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Teléfono destino por defecto (opcional)"), tel)));

  const lista = h("div", { class: "list" });
  if (!datos.ajustes.plantillas.length) lista.appendChild(h("p", { class: "muted", style: "text-align:center;padding:14px" }, "Sin plantillas."));
  datos.ajustes.plantillas.forEach((p) => {
    lista.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, p.nombre || "(sin nombre)"),
        h("span", { class: "list-item__meta" }, (p.texto || "").slice(0, 70) + ((p.texto || "").length > 70 ? "…" : ""))),
      h("div", { class: "list-item__actions" },
        h("button", { class: "btn btn--primary btn--sm", onclick: () => enviarPlantillaWhatsApp(p) }, "📱 Enviar"),
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => editarPlantilla(structuredClone(p), false) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => borrarPlantilla(p) }, "🗑️"))));
  });
  panel.appendChild(lista);
  panel.appendChild(h("p", { class: "muted small", style: "margin-top:10px" }, "Variables: {unidad} y {fecha} se reemplazan al usar la plantilla."));
  cont.appendChild(panel);
}
function editarPlantilla(p, esNueva) {
  const nombre = inp("text", p.nombre);
  const texto = h("textarea", { rows: "6" }, p.texto || "");
  modal({
    titulo: esNueva ? "Nueva plantilla" : "Editar plantilla",
    cuerpo: h("div", {},
      h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Nombre"), nombre),
      h("div", { class: "field" }, h("label", {}, "Texto"), texto)),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      { texto: "💾 Guardar", clase: "btn--primary", valor: "ok", onClick: () => {
        if (!nombre.value.trim()) { toast("Indica un nombre", "err"); return false; }
        p.nombre = nombre.value.trim(); p.texto = texto.value;
        const idx = datos.ajustes.plantillas.findIndex((x) => x.id === p.id);
        if (idx >= 0) datos.ajustes.plantillas[idx] = p; else datos.ajustes.plantillas.push(p);
        persistir().then(() => { toast("Plantilla guardada", "ok"); render(); });
      } },
    ],
  });
}
async function borrarPlantilla(p) {
  if (!await confirmar(`¿Eliminar la plantilla “${p.nombre}”?`, { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  datos.ajustes.plantillas = datos.ajustes.plantillas.filter((x) => x.id !== p.id);
  await persistir(); toast("Plantilla eliminada", ""); render();
}
function enviarPlantillaWhatsApp(p) {
  const texto = aplicarVariables(p.texto);
  const tel = (datos.ajustes.telefono || "").replace(/[^\d]/g, "");
  window.open(`https://api.whatsapp.com/send?${tel ? "phone=" + tel + "&" : ""}text=${encodeURIComponent(texto)}`, "_blank");
}

/* =================== HELPERS =================== */
function inp(type, value) { return h("input", { type, value: value ?? "" }); }
function sel(opciones, valor) { return h("select", {}, ...opciones.map((o) => h("option", { value: o, selected: o === valor }, o))); }
function campo(label, control) { return h("div", { class: "field" }, h("label", {}, label), control); }
function primeraLinea(t) { return (t || "").split("\n").map((x) => x.trim()).find((x) => x) || ""; }
function aplicarVariables(txt) {
  const unidad = primeraLinea(R.unidad && R.unidad.value) || datos.ajustes.unidad || "";
  return (txt || "").replace(/\{unidad\}/g, unidad).replace(/\{fecha\}/g, fechaLarga(fechaHoy()));
}
function dtgAhora() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${datos.ajustes.lugar || "La Paz"}, ${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}-${MESES[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}
function blobADataURL(blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }
