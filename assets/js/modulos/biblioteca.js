/*
 * biblioteca.js — Módulo "Biblioteca Virtual".
 *
 * Permite cargar reglamentos y documentos (PDF, Word, Excel, imágenes…),
 * clasificarlos por categorías definidas por el usuario y consultarlos
 * cuando los necesite. Los archivos se guardan en la subcarpeta "Biblioteca"
 * de la carpeta de datos; los metadatos en biblioteca.json.
 */
import { h, limpiar, toast, modal, confirmar, idNuevo } from "../ui.js";

const ARCHIVO = "biblioteca";
const CAT_DEF = ["Reglamentos", "Directivas", "Manuales", "Órdenes", "Otros"];
const CARPETA = "Biblioteca";

let ctx, cont, datos;
let fCat = "todas";
let fTexto = "";

function baseVacia() { return { ajustes: { categorias: [...CAT_DEF] }, lista: [] }; }

export async function bibliotecaModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || baseVacia();
  if (!datos.ajustes) datos.ajustes = { categorias: [...CAT_DEF] };
  if (!datos.lista) datos.lista = [];
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

/* ---------- Iconos por tipo ---------- */
function iconoDe(nombre = "", mime = "") {
  const ext = (nombre.split(".").pop() || "").toLowerCase();
  if (mime.includes("pdf") || ext === "pdf") return "📕";
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return "📘";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "📗";
  if (["ppt", "pptx", "odp"].includes(ext)) return "📙";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext) || mime.startsWith("image/")) return "🖼️";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  return "📄";
}
function tamanoLegible(bytes = 0) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/* ---------- Render principal ---------- */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "📚 Biblioteca Virtual"),
      h("div", { class: "sub" }, "Reglamentos y documentos clasificados a tu criterio")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--primary", onclick: subirDocumento }, "＋ Cargar documento"),
      h("button", { class: "btn btn--ghost", onclick: gestionarCategorias }, "⚙️ Categorías"))));

  // Filtros: categorías como chips
  const chips = h("div", { class: "chips", style: "margin-bottom:14px" });
  chips.appendChild(chipCat("todas", `Todas (${datos.lista.length})`));
  datos.ajustes.categorias.forEach((c) => {
    const n = datos.lista.filter((d) => d.categoria === c).length;
    chips.appendChild(chipCat(c, `${c} (${n})`));
  });
  cont.appendChild(chips);

  // Buscador
  cont.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" },
      h("input", { type: "search", placeholder: "Buscar por título o descripción…", value: fTexto,
        oninput: (e) => { fTexto = e.target.value; repintar(); } }))));

  const wrap = h("div", { id: "bibWrap" });
  cont.appendChild(wrap);
  repintar();
}

function chipCat(val, txt) {
  return h("span", { class: `chip ${fCat === val ? "active" : ""}`, onclick: () => { fCat = val; render(); } }, txt);
}

function filtrados() {
  const t = fTexto.trim().toLowerCase();
  return datos.lista
    .filter((d) => fCat === "todas" || d.categoria === fCat)
    .filter((d) => !t || [d.titulo, d.descripcion, d.nombreOriginal].some((x) => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => (a.titulo || "").localeCompare(b.titulo || ""));
}

function repintar() {
  const wrap = document.getElementById("bibWrap");
  if (!wrap) return;
  limpiar(wrap);
  const lista = filtrados();
  if (!lista.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "📚"),
      h("p", {}, datos.lista.length ? "No hay documentos que coincidan." : "La biblioteca está vacía."),
      h("p", { class: "muted" }, "Carga tu primer reglamento con “Cargar documento”.")));
    return;
  }
  const grid = h("div", { class: "grid-modulos" });
  for (const d of lista) {
    grid.appendChild(h("div", { class: "modulo-card", style: "min-height:auto;cursor:default" },
      h("span", { class: "modulo-card__badge badge-listo" }, d.categoria || "Sin categoría"),
      h("div", { style: "display:flex;gap:12px;align-items:center" },
        h("div", { class: "modulo-card__icon", style: "font-size:24px;width:46px;height:46px" }, iconoDe(d.nombreOriginal, d.tipoMime)),
        h("div", { style: "min-width:0" },
          h("h3", { class: "modulo-card__title", style: "font-size:15px" }, d.titulo || d.nombreOriginal),
          h("p", { class: "modulo-card__desc", style: "margin:0" }, `${(d.nombreOriginal || "").split(".").pop().toUpperCase()} · ${tamanoLegible(d.tamano)}`))),
      d.descripcion ? h("p", { class: "modulo-card__desc" }, d.descripcion) : null,
      h("div", { class: "btn-row", style: "margin-top:auto" },
        h("button", { class: "btn btn--primary btn--sm", onclick: () => abrir(d) }, "👁️ Abrir"),
        h("button", { class: "btn btn--gold btn--sm", onclick: () => descargar(d) }, "⬇️"),
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => editar(d) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminar(d) }, "🗑️"))));
  }
  wrap.appendChild(grid);
}

/* ---------- Cargar documento ---------- */
function subirDocumento() {
  const input = h("input", { type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.rtf,.odt" });
  const tituloInp = h("input", { type: "text", placeholder: "Título (ej.: Reglamento de Correspondencia Militar)" });
  const selCat = h("select", {}, ...datos.ajustes.categorias.map((c) => h("option", { value: c }, c)));
  const descInp = h("textarea", { rows: "2", placeholder: "Descripción o notas (opcional)" });
  const nombreLbl = h("span", { class: "muted small" }, "Ningún archivo seleccionado");

  input.addEventListener("change", () => {
    const file = input.files[0];
    if (file) {
      nombreLbl.textContent = `${file.name} · ${tamanoLegible(file.size)}`;
      if (!tituloInp.value) tituloInp.value = file.name.replace(/\.[^.]+$/, "");
    }
  });

  const cuerpo = h("div", {},
    h("div", { class: "field", style: "margin-bottom:12px" },
      h("label", {}, "Archivo"),
      h("label", { class: "btn btn--ghost", style: "cursor:pointer;justify-content:center" }, "📎 Seleccionar archivo", input),
      nombreLbl),
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Título"), tituloInp),
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Categoría"), selCat),
    h("div", { class: "field" }, h("label", {}, "Descripción"), descInp));

  modal({
    titulo: "📚 Cargar documento",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          const file = input.files[0];
          if (!file) { toast("Selecciona un archivo", "err"); return false; }
          if (!tituloInp.value.trim()) { toast("Indica un título", "err"); return false; }
          guardarArchivoNuevo(file, tituloInp.value.trim(), selCat.value, descInp.value.trim());
        },
      },
    ],
  });
}

async function guardarArchivoNuevo(file, titulo, categoria, descripcion) {
  const id = idNuevo();
  const limpio = file.name.replace(/[^\w.\-]+/g, "_");
  const nombreGuardado = `${id}__${limpio}`;
  try {
    const ruta = await ctx.store.guardarArchivo(CARPETA, nombreGuardado, file);
    datos.lista.push({
      id, titulo, categoria, descripcion,
      nombreOriginal: file.name, nombreGuardado, ruta,
      tipoMime: file.type, tamano: file.size, creado: Date.now(),
    });
    await persistir();
    toast("Documento cargado", "ok");
    render();
  } catch (e) {
    console.error(e);
    toast("No se pudo guardar el archivo", "err");
  }
}

/* ---------- Abrir / descargar ---------- */
async function abrir(d) {
  try {
    const url = await ctx.store.urlArchivo(d.ruta);
    if (!url) { toast("No se encontró el archivo", "err"); return; }
    const esPDF = (d.tipoMime || "").includes("pdf") || /\.pdf$/i.test(d.nombreOriginal);
    const esImg = (d.tipoMime || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(d.nombreOriginal);
    if (esPDF || esImg) {
      // Visor incrustado a pantalla casi completa
      const visor = esPDF
        ? h("iframe", { src: url, style: "width:100%;height:78vh;border:none;border-radius:8px" })
        : h("img", { src: url, style: "max-width:100%;max-height:78vh;display:block;margin:0 auto;border-radius:8px" });
      const back = h("div", { class: "modal-back" });
      const box = h("div", { class: "modal", style: "max-width:min(1000px,95vw);width:100%" },
        h("div", { class: "modal__head" },
          h("h3", {}, `${iconoDe(d.nombreOriginal, d.tipoMime)} ${d.titulo || d.nombreOriginal}`),
          h("div", { class: "btn-row" },
            h("button", { class: "btn btn--gold btn--sm", onclick: () => descargar(d) }, "⬇️ Descargar"),
            h("button", { class: "iconbtn", style: "background:#eee;color:#333;border:none", onclick: () => { back.remove(); URL.revokeObjectURL(url); } }, "✕"))),
        h("div", { class: "modal__body", style: "padding:12px" }, visor));
      back.appendChild(box);
      back.addEventListener("click", (e) => { if (e.target === back) { back.remove(); URL.revokeObjectURL(url); } });
      document.body.appendChild(back);
    } else {
      // Otros formatos (Word/Excel/PPT): se descargan para abrir con su programa
      descargar(d);
    }
  } catch (e) { console.error(e); toast("No se pudo abrir el documento", "err"); }
}

async function descargar(d) {
  try {
    const blob = await ctx.store.leerArchivo(d.ruta);
    if (!blob) { toast("No se encontró el archivo", "err"); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = d.nombreOriginal || d.titulo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { console.error(e); toast("No se pudo descargar", "err"); }
}

/* ---------- Editar metadatos ---------- */
function editar(d) {
  const tituloInp = h("input", { type: "text", value: d.titulo || "" });
  const selCat = h("select", {}, ...datos.ajustes.categorias.map((c) => h("option", { value: c, selected: c === d.categoria }, c)));
  const descInp = h("textarea", { rows: "3" }, d.descripcion || "");
  const cuerpo = h("div", {},
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Título"), tituloInp),
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Categoría"), selCat),
    h("div", { class: "field" }, h("label", {}, "Descripción"), descInp),
    h("p", { class: "muted small" }, `Archivo: ${d.nombreOriginal} · ${tamanoLegible(d.tamano)}`));
  modal({
    titulo: "✏️ Editar documento",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          if (!tituloInp.value.trim()) { toast("Indica un título", "err"); return false; }
          d.titulo = tituloInp.value.trim(); d.categoria = selCat.value; d.descripcion = descInp.value.trim();
          persistir().then(() => { toast("Cambios guardados", "ok"); render(); });
        },
      },
    ],
  });
}

async function eliminar(d) {
  if (!await confirmar(`¿Eliminar “${d.titulo || d.nombreOriginal}” de la biblioteca? El archivo también se borrará.`, { titulo: "Eliminar documento", textoOk: "Eliminar", peligro: true })) return;
  try { await ctx.store.borrarArchivo(d.ruta); } catch {}
  datos.lista = datos.lista.filter((x) => x.id !== d.id);
  await persistir();
  toast("Documento eliminado", "");
  render();
}

/* ---------- Gestionar categorías ---------- */
function gestionarCategorias() {
  const cuerpo = h("div", {});
  const lista = h("div", { class: "list" });
  function pintar() {
    limpiar(lista);
    datos.ajustes.categorias.forEach((c, i) => {
      lista.appendChild(h("div", { class: "list-item", style: "padding:8px 12px" },
        h("span", { class: "list-item__title" }, `${c}  `, h("span", { class: "muted small" }, `(${datos.lista.filter((d) => d.categoria === c).length})`)),
        h("div", { class: "list-item__actions" },
          h("button", {
            class: "btn btn--danger btn--sm", onclick: async () => {
              if (datos.lista.some((d) => d.categoria === c) && !await confirmar(`La categoría "${c}" tiene documentos. ¿Quitarla igual? (los documentos quedan sin categoría)`, { titulo: "Quitar categoría", textoOk: "Quitar", peligro: true })) return;
              datos.ajustes.categorias.splice(i, 1); await persistir(); pintar();
            }
          }, "🗑️"))));
    });
  }
  pintar();
  const nueva = h("input", { type: "text", placeholder: "Nueva categoría…", style: "flex:1" });
  const agregar = h("button", {
    class: "btn btn--primary", onclick: async () => {
      const v = nueva.value.trim(); if (!v) return;
      if (datos.ajustes.categorias.includes(v)) { toast("Ya existe", "err"); return; }
      datos.ajustes.categorias.push(v); nueva.value = ""; await persistir(); pintar();
    }
  }, "＋ Agregar");
  cuerpo.append(lista, h("div", { class: "form-row mt", style: "align-items:center" }, nueva, agregar));
  modal({ titulo: "⚙️ Categorías", cuerpo, acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null, onClick: () => render() }] });
}
