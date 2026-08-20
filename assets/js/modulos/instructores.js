/*
 * instructores.js — Módulo "Libro de Vida de Instructores".
 *
 * Registro individual de cada instructor: ficha con foto, datos personales y
 * militares, situación particular (observaciones) y documentos PDF adjuntos.
 * Fotos y documentos se guardan en la subcarpeta "Instructores/<id>" de la
 * carpeta de datos; los metadatos en instructores.json.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";

const ARCHIVO = "instructores";
const CATEGORIAS = ["Oficiales", "Suboficiales", "Sargentos", "EE.CC."];

let ctx, cont, datos;
let vista = { modo: "lista", id: null };
let fTexto = "";

export async function instructoresModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || { lista: [] };
  if (!datos.lista) datos.lista = [];
  vista = { modo: "lista", id: null };
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

function nombreCompleto(i) {
  return [i.grado, i.apellidos, i.nombres].filter(Boolean).join(" ").trim() || "Sin nombre";
}
function tamanoLegible(b = 0) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB"; }

async function pintarFoto(imgEl, ruta) {
  if (!ruta) return;
  try { const url = await ctx.store.urlArchivo(ruta); if (url) imgEl.src = url; } catch {}
}

/* =================== RENDER RAÍZ =================== */
function render() {
  limpiar(cont);
  if (vista.modo === "detalle") renderDetalle(vista.id);
  else renderLista();
}

/* =================== LISTA =================== */
function renderLista() {
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "🎖️ Libro de Vida de Instructores"),
      h("div", { class: "sub" }, "Ficha, foto, situación y documentos de cada instructor")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--ghost", onclick: exportarRespaldo }, "⬇️ Exportar respaldo"),
      h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevoInstructor(), true) }, "＋ Nuevo instructor"))));

  cont.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" },
      h("input", { type: "search", placeholder: "Buscar por nombre, grado o especialidad…", value: fTexto,
        oninput: (e) => { fTexto = e.target.value; repintarLista(); } }))));

  const wrap = h("div", { id: "instWrap" });
  cont.appendChild(wrap);
  repintarLista();
}

function listaFiltrada() {
  const t = fTexto.trim().toLowerCase();
  return datos.lista
    .filter((i) => !t || [i.nombres, i.apellidos, i.grado, i.especialidad].some((x) => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)));
}

function tarjetaInstructor(i) {
  const foto = h("img", { alt: "", style: "width:64px;height:64px;border-radius:50%;object-fit:cover;background:var(--panel-2);border:2px solid var(--oliva)" });
  foto.src = fotoPlaceholder();
  pintarFoto(foto, i.fotoRuta);
  return h("div", { class: "modulo-card", style: "min-height:auto;cursor:pointer", onclick: () => { vista = { modo: "detalle", id: i.id }; render(); } },
    h("div", { style: "display:flex;gap:14px;align-items:center" },
      foto,
      h("div", { style: "min-width:0" },
        h("h3", { class: "modulo-card__title", style: "font-size:16px" }, nombreCompleto(i)),
        h("p", { class: "modulo-card__desc", style: "margin:2px 0 0" }, i.especialidad || "Sin especialidad"),
        i.unidad ? h("p", { class: "modulo-card__desc", style: "margin:0" }, i.unidad) : null)),
    h("div", { class: "muted small", style: "margin-top:6px" },
      `${(i.documentos || []).length} documento(s)`));
}

function repintarLista() {
  const wrap = document.getElementById("instWrap");
  if (!wrap) return;
  limpiar(wrap);
  const lista = listaFiltrada();
  if (!lista.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "🎖️"),
      h("p", {}, datos.lista.length ? "No hay instructores que coincidan." : "Aún no hay instructores registrados."),
      h("p", { class: "muted" }, "Agrega el primero con “Nuevo instructor”.")));
    return;
  }
  const grupos = new Map(CATEGORIAS.map((c) => [c, []]));
  grupos.set("Sin categoría", []);
  for (const i of lista) grupos.get(CATEGORIAS.includes(i.categoria) ? i.categoria : "Sin categoría").push(i);

  for (const [cat, items] of grupos) {
    if (!items.length) continue;
    wrap.appendChild(h("h3", { style: "margin:18px 0 8px;color:var(--verde-800)" }, `${cat} (${items.length})`));
    const grid = h("div", { class: "grid-modulos" });
    for (const i of items) grid.appendChild(tarjetaInstructor(i));
    wrap.appendChild(grid);
  }
}

function exportarRespaldo() {
  const grupos = new Map(CATEGORIAS.map((c) => [c, []]));
  grupos.set("Sin categoría", []);
  for (const i of datos.lista) grupos.get(CATEGORIAS.includes(i.categoria) ? i.categoria : "Sin categoría").push(i);

  let cuerpo = `<h1>Libro de Vida de Instructores</h1><div class="encabezado sub">Respaldo generado el ${escapar(fechaLarga(fechaHoy()))} · Total: ${datos.lista.length}</div>`;
  for (const [cat, items] of grupos) {
    if (!items.length) continue;
    cuerpo += `<h2 style="text-align:left;margin-top:18pt">${escapar(cat)} (${items.length})</h2>`;
    cuerpo += `<table><thead><tr><th>Grado</th><th>Nombres y apellidos</th><th>Especialidad</th><th>Unidad</th><th>C.I.</th><th>Teléfono</th><th>Fecha de alta</th></tr></thead><tbody>`;
    for (const i of items.slice().sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))) {
      cuerpo += `<tr><td>${escapar(i.grado)}</td><td>${escapar([i.apellidos, i.nombres].filter(Boolean).join(" "))}</td><td>${escapar(i.especialidad)}</td><td>${escapar(i.unidad)}</td><td>${escapar(i.ci)}</td><td>${escapar(i.telefono)}</td><td>${i.alta ? escapar(fechaLarga(i.alta)) : ""}</td></tr>`;
    }
    cuerpo += `</tbody></table>`;
  }
  const blob = blobWord("Libro de Vida de Instructores", cuerpo, { size: "29.7cm 21cm", margin: "1.5cm 2cm" });
  descargar(blob, `Libro_de_Vida_Instructores_${fechaHoy()}.doc`);
  toast("Respaldo exportado", "ok");
}

function fotoPlaceholder() {
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#e4e7d6'/><circle cx='32' cy='25' r='12' fill='#b6bd9c'/><path d='M12 60 c0-13 40-13 40 0' fill='#b6bd9c'/></svg>`);
}

/* =================== DETALLE =================== */
function renderDetalle(id) {
  const i = datos.lista.find((x) => x.id === id);
  if (!i) { vista = { modo: "lista" }; return renderLista(); }

  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "🎖️ Ficha del instructor")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--ghost", onclick: () => { vista = { modo: "lista" }; render(); } }, "← Volver"),
      h("button", { class: "btn btn--ghost", onclick: () => exportarFicha(i) }, "📄 Exportar ficha"),
      h("button", { class: "btn btn--gold", onclick: () => abrirEditor(structuredClone(i), false) }, "✏️ Editar"),
      h("button", { class: "btn btn--danger", onclick: () => eliminarInstructor(i) }, "🗑️ Eliminar"))));

  // Cabecera con foto y datos
  const foto = h("img", { alt: "", style: "width:120px;height:120px;border-radius:12px;object-fit:cover;background:var(--panel-2);border:2px solid var(--oliva)" });
  foto.src = fotoPlaceholder();
  pintarFoto(foto, i.fotoRuta);

  const datosGrid = h("div", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 20px;flex:1" });
  const campos = [
    ["Categoría", i.categoria || "Sin categoría"], ["Grado", i.grado], ["Especialidad", i.especialidad], ["Unidad", i.unidad],
    ["C.I. / Documento", i.ci], ["Fecha de nacimiento", i.nacimiento ? fechaLarga(i.nacimiento) : ""],
    ["Teléfono", i.telefono], ["Dirección", i.direccion], ["Fecha de alta", i.alta ? fechaLarga(i.alta) : ""],
  ];
  for (const [et, val] of campos) {
    datosGrid.appendChild(h("div", {},
      h("div", { class: "muted small", style: "text-transform:uppercase;letter-spacing:.3px;font-weight:700" }, et),
      h("div", { style: "font-size:15px" }, val || "—")));
  }

  cont.appendChild(h("div", { class: "panel" },
    h("div", { style: "display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start" },
      h("div", { style: "text-align:center" }, foto, h("div", { style: "font-weight:800;color:var(--verde-800);margin-top:8px;max-width:130px" }, nombreCompleto(i))),
      datosGrid)));

  // Situación particular
  cont.appendChild(h("div", { class: "panel" },
    h("h3", {}, "Situación particular"),
    h("p", { style: "white-space:pre-wrap;margin:0", class: i.situacion ? "" : "muted" }, i.situacion || "Sin observaciones registradas.")));

  // Documentos
  const panelDocs = h("div", { class: "panel" });
  panelDocs.appendChild(h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px" },
    h("h3", { style: "margin:0;border:none;padding:0" }, "Documentos"),
    h("button", { class: "btn btn--primary btn--sm", onclick: () => subirDocumento(i) }, "＋ Cargar documento")));
  const listaDocs = h("div", { class: "list" });
  if (!(i.documentos || []).length) {
    listaDocs.appendChild(h("p", { class: "muted", style: "text-align:center;padding:14px" }, "Sin documentos. Carga PDF u otros archivos sobre su situación."));
  } else {
    for (const doc of i.documentos) {
      listaDocs.appendChild(h("div", { class: "list-item" },
        h("div", { class: "list-item__main" },
          h("span", { class: "list-item__title" }, `${iconoDoc(doc.nombreOriginal, doc.tipoMime)} ${doc.titulo || doc.nombreOriginal}`),
          h("span", { class: "list-item__meta" }, `${doc.nombreOriginal} · ${tamanoLegible(doc.tamano)} · ${doc.fecha ? fechaLarga(doc.fecha) : ""}`)),
        h("div", { class: "list-item__actions" },
          h("button", { class: "btn btn--gold btn--sm", onclick: () => descargarDoc(doc) }, "⬇️"),
          h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarDoc(i, doc) }, "🗑️"))));
    }
  }
  panelDocs.appendChild(listaDocs);
  cont.appendChild(panelDocs);
}

function iconoDoc(nombre = "", mime = "") {
  const ext = (nombre.split(".").pop() || "").toLowerCase();
  if (mime.includes("pdf") || ext === "pdf") return "📕";
  if (["doc", "docx"].includes(ext)) return "📘";
  if (["xls", "xlsx"].includes(ext)) return "📗";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext) || mime.startsWith("image/")) return "🖼️";
  return "📄";
}

/* =================== CREAR / EDITAR FICHA =================== */
function nuevoInstructor() {
  return {
    id: idNuevo(), categoria: "Oficiales", grado: "", nombres: "", apellidos: "", especialidad: "", unidad: "",
    ci: "", nacimiento: "", telefono: "", direccion: "", alta: fechaHoy(),
    fotoRuta: "", situacion: "", documentos: [], creado: Date.now(), actualizado: Date.now(),
  };
}

function abrirEditor(inst, esNuevo) {
  const campo = (et, val, tipo = "text") => {
    const inp = h("input", { type: tipo, value: val || "" });
    return { el: h("div", { class: "field" }, h("label", {}, et), inp), inp };
  };
  const catSel = h("select", {}, ...CATEGORIAS.map((c) => h("option", { value: c, selected: (inst.categoria || "Oficiales") === c }, c)));
  const cat = { el: h("div", { class: "field" }, h("label", {}, "Categoría"), catSel), inp: catSel };
  const g = campo("Grado", inst.grado);
  const nom = campo("Nombres", inst.nombres);
  const ape = campo("Apellidos", inst.apellidos);
  const esp = campo("Especialidad", inst.especialidad);
  const uni = campo("Unidad", inst.unidad);
  const ci = campo("C.I. / Documento", inst.ci);
  const nac = campo("Fecha de nacimiento", inst.nacimiento, "date");
  const tel = campo("Teléfono", inst.telefono);
  const dir = campo("Dirección", inst.direccion);
  const alta = campo("Fecha de alta", inst.alta, "date");
  const sit = h("textarea", { rows: "3", placeholder: "Situación particular / observaciones" }, inst.situacion || "");

  // Foto
  let nuevaFoto = null;
  const fotoPrev = h("img", { alt: "", style: "width:90px;height:90px;border-radius:12px;object-fit:cover;background:var(--panel-2);border:2px solid var(--oliva)" });
  fotoPrev.src = fotoPlaceholder();
  pintarFoto(fotoPrev, inst.fotoRuta);
  const fotoInput = h("input", { type: "file", accept: "image/*", style: "display:none" });
  fotoInput.addEventListener("change", () => {
    const f = fotoInput.files[0];
    if (f) { nuevaFoto = f; fotoPrev.src = URL.createObjectURL(f); }
  });

  const cuerpo = h("div", {},
    h("div", { style: "display:flex;gap:16px;align-items:center;margin-bottom:14px" },
      fotoPrev,
      h("label", { class: "btn btn--ghost", style: "cursor:pointer" }, "📷 Cambiar foto", fotoInput)),
    h("div", { class: "form-row" }, cat.el, esp.el),
    h("div", { class: "form-row" }, g.el, uni.el),
    h("div", { class: "form-row" }, nom.el, ape.el),
    h("div", { class: "form-row" }, ci.el),
    h("div", { class: "form-row" }, nac.el, tel.el),
    h("div", { class: "form-row" }, dir.el, alta.el),
    h("div", { class: "field" }, h("label", {}, "Situación particular"), sit));

  modal({
    titulo: esNuevo ? "🎖️ Nuevo instructor" : "✏️ Editar instructor",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          if (!nom.inp.value.trim() && !ape.inp.value.trim()) { toast("Indica al menos nombres o apellidos", "err"); return false; }
          Object.assign(inst, {
            categoria: cat.inp.value, grado: g.inp.value.trim(), nombres: nom.inp.value.trim(), apellidos: ape.inp.value.trim(),
            especialidad: esp.inp.value.trim(), unidad: uni.inp.value.trim(), ci: ci.inp.value.trim(),
            nacimiento: nac.inp.value, telefono: tel.inp.value.trim(), direccion: dir.inp.value.trim(),
            alta: alta.inp.value, situacion: sit.value.trim(), actualizado: Date.now(),
          });
          guardarInstructor(inst, esNuevo, nuevaFoto);
        },
      },
    ],
  });
}

async function guardarInstructor(inst, esNuevo, nuevaFoto) {
  try {
    if (nuevaFoto) {
      const ext = (nuevaFoto.name.split(".").pop() || "jpg").toLowerCase();
      const nombre = `foto_${Date.now()}.${ext}`;
      inst.fotoRuta = await ctx.store.guardarArchivo(`Instructores/${inst.id}`, nombre, nuevaFoto);
    }
    if (esNuevo) datos.lista.push(inst);
    else { const idx = datos.lista.findIndex((x) => x.id === inst.id); if (idx >= 0) datos.lista[idx] = inst; }
    await persistir();
    toast("Instructor guardado", "ok");
    vista = { modo: "detalle", id: inst.id };
    render();
  } catch (e) { console.error(e); toast("No se pudo guardar", "err"); }
}

/* =================== EXPORTAR FICHA INDIVIDUAL (foto + documentos en ZIP) =================== */
function blobADataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

let tablaCRC32;
function crc32(bytes) {
  if (!tablaCRC32) {
    tablaCRC32 = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tablaCRC32[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tablaCRC32[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ZIP mínimo sin compresión ("store"): suficiente para empaquetar la ficha + documentos originales.
function construirZip(entradas) {
  const ahora = new Date();
  const dosFecha = (((ahora.getFullYear() - 1980) & 0x7f) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const dosHora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const partes = [];
  const centrales = [];
  let offset = 0;

  for (const { nombre, bytes } of entradas) {
    const nombreBytes = new TextEncoder().encode(nombre);
    const crc = crc32(bytes);

    const local = new Uint8Array(30 + nombreBytes.length);
    const dvL = new DataView(local.buffer);
    dvL.setUint32(0, 0x04034b50, true);
    dvL.setUint16(4, 20, true);
    dvL.setUint16(6, 0, true);
    dvL.setUint16(8, 0, true);
    dvL.setUint16(10, dosHora, true);
    dvL.setUint16(12, dosFecha, true);
    dvL.setUint32(14, crc, true);
    dvL.setUint32(18, bytes.length, true);
    dvL.setUint32(22, bytes.length, true);
    dvL.setUint16(26, nombreBytes.length, true);
    dvL.setUint16(28, 0, true);
    local.set(nombreBytes, 30);
    partes.push(local, bytes);

    const central = new Uint8Array(46 + nombreBytes.length);
    const dvC = new DataView(central.buffer);
    dvC.setUint32(0, 0x02014b50, true);
    dvC.setUint16(4, 20, true);
    dvC.setUint16(6, 20, true);
    dvC.setUint16(8, 0, true);
    dvC.setUint16(10, 0, true);
    dvC.setUint16(12, dosHora, true);
    dvC.setUint16(14, dosFecha, true);
    dvC.setUint32(16, crc, true);
    dvC.setUint32(20, bytes.length, true);
    dvC.setUint32(24, bytes.length, true);
    dvC.setUint16(28, nombreBytes.length, true);
    dvC.setUint32(38, 0, true);
    dvC.setUint32(42, offset, true);
    central.set(nombreBytes, 46);
    centrales.push(central);

    offset += local.length + bytes.length;
  }

  const centralStart = offset;
  const centralSize = centrales.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const dvE = new DataView(eocd.buffer);
  dvE.setUint32(0, 0x06054b50, true);
  dvE.setUint16(8, entradas.length, true);
  dvE.setUint16(10, entradas.length, true);
  dvE.setUint32(12, centralSize, true);
  dvE.setUint32(16, centralStart, true);

  return new Blob([...partes, ...centrales, eocd], { type: "application/zip" });
}

function nombreSinColision(nombreDeseado, usados) {
  let nombre = nombreDeseado.replace(/[\\/:*?"<>|]+/g, "_") || "documento";
  if (!usados.has(nombre.toLowerCase())) { usados.add(nombre.toLowerCase()); return nombre; }
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext = punto > 0 ? nombre.slice(punto) : "";
  let n = 2;
  while (usados.has(`${base}_${n}${ext}`.toLowerCase())) n++;
  nombre = `${base}_${n}${ext}`;
  usados.add(nombre.toLowerCase());
  return nombre;
}

async function exportarFicha(inst) {
  try {
    let fotoDataUrl = "";
    if (inst.fotoRuta) {
      const blob = await ctx.store.leerArchivo(inst.fotoRuta);
      if (blob) fotoDataUrl = await blobADataURL(blob);
    }
    const campos = [
      ["Categoría", inst.categoria || "Sin categoría"], ["Grado", inst.grado], ["Especialidad", inst.especialidad],
      ["Unidad", inst.unidad], ["C.I. / Documento", inst.ci],
      ["Fecha de nacimiento", inst.nacimiento ? fechaLarga(inst.nacimiento) : ""],
      ["Teléfono", inst.telefono], ["Dirección", inst.direccion],
      ["Fecha de alta", inst.alta ? fechaLarga(inst.alta) : ""],
    ];
    let cuerpo = `<h1>Ficha del instructor</h1>`;
    if (fotoDataUrl) cuerpo += `<div style="text-align:center;margin-bottom:12pt"><img src="${fotoDataUrl}" style="width:130pt;height:130pt;object-fit:cover;border:1px solid #000"></div>`;
    cuerpo += `<h2 style="text-align:left">${escapar(nombreCompleto(inst))}</h2><table><tbody>`;
    for (const [et, val] of campos) cuerpo += `<tr><td style="font-weight:bold;width:35%">${escapar(et)}</td><td>${escapar(val || "—")}</td></tr>`;
    cuerpo += `</tbody></table>`;
    cuerpo += `<h2 style="text-align:left;margin-top:16pt">Situación particular</h2><p>${escapar(inst.situacion || "Sin observaciones registradas.")}</p>`;
    const docs = inst.documentos || [];
    if (docs.length) {
      cuerpo += `<h2 style="text-align:left;margin-top:16pt">Documentos adjuntos</h2><ul>`;
      for (const d of docs) cuerpo += `<li>${escapar(d.titulo || d.nombreOriginal)} (${escapar(d.nombreOriginal)})</li>`;
      cuerpo += `</ul>`;
    }
    const docBlob = blobWord(`Ficha - ${nombreCompleto(inst)}`, cuerpo);
    const nombreBase = nombreCompleto(inst).replace(/[^\w\-]+/g, "_");

    let incluirDocs = false;
    if (docs.length) {
      incluirDocs = await confirmar(
        `Esta ficha tiene ${docs.length} documento(s) adjunto(s) (memorándums, solicitudes, etc.). ¿Deseas incluirlos junto con la ficha en un archivo ZIP?`,
        { titulo: "Incluir documentos", textoOk: "Sí, incluir" });
    }

    if (!incluirDocs) {
      descargar(docBlob, `Ficha_${nombreBase}.doc`);
      toast("Ficha exportada", "ok");
      return;
    }

    const usados = new Set();
    const entradas = [{ nombre: nombreSinColision("Ficha.doc", usados), bytes: new Uint8Array(await docBlob.arrayBuffer()) }];
    for (const d of docs) {
      const blob = await ctx.store.leerArchivo(d.ruta);
      if (!blob) continue;
      const nombre = nombreSinColision(d.nombreOriginal || d.titulo || "documento", usados);
      entradas.push({ nombre: `Documentos/${nombre}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
    descargar(construirZip(entradas), `Ficha_${nombreBase}.zip`);
    toast("Ficha y documentos exportados", "ok");
  } catch (e) {
    console.error(e);
    toast("No se pudo exportar la ficha", "err");
  }
}

async function eliminarInstructor(i) {
  if (!await confirmar(`¿Eliminar la ficha de ${nombreCompleto(i)}? Se borrarán su foto y documentos.`, { titulo: "Eliminar instructor", textoOk: "Eliminar", peligro: true })) return;
  try {
    if (i.fotoRuta) await ctx.store.borrarArchivo(i.fotoRuta);
    for (const d of i.documentos || []) { try { await ctx.store.borrarArchivo(d.ruta); } catch {} }
  } catch {}
  datos.lista = datos.lista.filter((x) => x.id !== i.id);
  await persistir();
  toast("Instructor eliminado", "");
  vista = { modo: "lista" };
  render();
}

/* =================== DOCUMENTOS DEL INSTRUCTOR =================== */
function subirDocumento(inst) {
  const input = h("input", { type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" });
  const titulo = h("input", { type: "text", placeholder: "Título del documento (opcional)" });
  const nombreLbl = h("span", { class: "muted small" }, "Ningún archivo seleccionado");
  input.addEventListener("change", () => {
    const f = input.files[0];
    if (f) { nombreLbl.textContent = `${f.name} · ${tamanoLegible(f.size)}`; if (!titulo.value) titulo.value = f.name.replace(/\.[^.]+$/, ""); }
  });
  const cuerpo = h("div", {},
    h("div", { class: "field", style: "margin-bottom:12px" },
      h("label", {}, "Archivo"),
      h("label", { class: "btn btn--ghost", style: "cursor:pointer;justify-content:center" }, "📎 Seleccionar archivo", input),
      nombreLbl),
    h("div", { class: "field" }, h("label", {}, "Título"), titulo));
  modal({
    titulo: "📎 Cargar documento del instructor",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          const f = input.files[0];
          if (!f) { toast("Selecciona un archivo", "err"); return false; }
          guardarDoc(inst, f, titulo.value.trim());
        },
      },
    ],
  });
}

async function guardarDoc(inst, file, titulo) {
  try {
    const idDoc = idNuevo();
    const limpio = file.name.replace(/[^\w.\-]+/g, "_");
    const nombreGuardado = `doc_${idDoc}__${limpio}`;
    const ruta = await ctx.store.guardarArchivo(`Instructores/${inst.id}`, nombreGuardado, file);
    inst.documentos = inst.documentos || [];
    inst.documentos.push({
      id: idDoc, titulo: titulo || file.name, nombreOriginal: file.name, nombreGuardado, ruta,
      tipoMime: file.type, tamano: file.size, fecha: fechaHoy(),
    });
    await persistir();
    toast("Documento cargado", "ok");
    render();
  } catch (e) { console.error(e); toast("No se pudo guardar el documento", "err"); }
}

async function descargarDoc(doc) {
  try {
    const blob = await ctx.store.leerArchivo(doc.ruta);
    if (!blob) { toast("No se encontró el archivo", "err"); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = doc.nombreOriginal || doc.titulo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { console.error(e); toast("No se pudo descargar", "err"); }
}

async function eliminarDoc(inst, doc) {
  if (!await confirmar(`¿Eliminar el documento “${doc.titulo || doc.nombreOriginal}”?`, { titulo: "Eliminar documento", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.store.borrarArchivo(doc.ruta); } catch {}
  inst.documentos = (inst.documentos || []).filter((x) => x.id !== doc.id);
  await persistir();
  toast("Documento eliminado", "");
  render();
}
