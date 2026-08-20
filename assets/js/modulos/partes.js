/*
 * partes.js — Módulo "Partes Diarios de la Unidad".
 *
 * Dos tipos de parte: personal de CUADROS y personal de TROPA.
 * Cada parte es una matriz configurable:  filas (grados / subunidades)  ×  columnas (estados).
 * Se guarda en la carpeta de datos (partes.json) y se puede exportar a Word y guardar
 * una copia .doc en la subcarpeta "Partes".
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";

const ARCHIVO = "partes";

const COLS_DEF = ["Efectivo", "Presentes", "Servicio", "Comisión", "Permiso", "Sanidad", "Arresto", "Otros"];
const FILAS_CUADROS = ["Tte. Coronel", "Mayor", "Capitán", "Teniente", "Subteniente", "Suboficiales", "Sargentos", "EE.CC."];

// Parte de Tropa: filas = categorías del parte, columnas = compañías/subunidades (al revés que Cuadros),
// replicando el esquema oficial del "Parte de Relevo" (anverso: cantidades por compañía; reverso: demostración/novedades).
const COLS_TROPA = ['Comp. "A"', 'Comp. "B"', 'Comp. "C"', 'Comp. "D"', 'Comp. "E"'];
const FILAS_TROPA = ["Efectivo", "Guardia Cuartel", "Servicio Interno", "Comisión", "Francos", "Bajas", "No Forman", "Forman"];

function baseVacia() {
  return {
    ajustes: {
      unidad: "",
      comandante: "",
      membreteTropa: ["", "", ""],
      cuadros: { columnas: [...COLS_DEF], filas: [...FILAS_CUADROS] },
      tropa: { columnas: [...COLS_TROPA], filas: [...FILAS_TROPA] },
    },
    lista: [],
  };
}

let ctx, cont, datos;

export async function partesModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || baseVacia();
  // Compatibilidad si el archivo viejo no trae ajustes.
  if (!datos.ajustes) datos = Object.assign(baseVacia(), { lista: datos.lista || [] });
  renderLista();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

/* ================= LISTA / HISTORIAL ================= */
let filtroTipo = "todos";

function renderLista() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "📋 Partes Diarios de la Unidad"),
      h("div", { class: "sub" }, "Parte de personal de cuadros y de tropa")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--primary", onclick: () => editarParte(nuevoParte("cuadros")) }, "＋ Parte de Cuadros"),
      h("button", { class: "btn btn--gold", onclick: () => editarParte(nuevoParte("tropa")) }, "＋ Parte de Tropa"))));

  // Filtros
  const chips = h("div", { class: "chips", style: "margin-bottom:16px" });
  for (const [val, txt] of [["todos", "Todos"], ["cuadros", "Cuadros"], ["tropa", "Tropa"]]) {
    chips.appendChild(h("span", {
      class: `chip ${filtroTipo === val ? "active" : ""}`,
      onclick: () => { filtroTipo = val; renderLista(); }
    }, txt));
  }
  cont.appendChild(chips);

  const lista = datos.lista
    .filter((p) => filtroTipo === "todos" || p.tipo === filtroTipo)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado || 0) - (a.creado || 0));

  if (!lista.length) {
    cont.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "🗒️"),
      h("p", {}, "Aún no hay partes registrados."),
      h("p", { class: "muted" }, "Crea el primero con los botones de arriba.")));
    return;
  }

  const cajaLista = h("div", { class: "list" });
  for (const p of lista) {
    const efectivo = totalColumna(p, "Efectivo");
    const presentes = totalColumna(p, "Presentes");
    cajaLista.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" },
          `Parte de ${p.tipo === "cuadros" ? "Cuadros" : "Tropa"} — ${fechaLarga(p.fecha)}`),
        h("span", { class: "list-item__meta" },
          `${p.unidad || "Unidad no indicada"}  ·  Efectivo: ${efectivo}   Presentes: ${presentes}`)),
      h("div", { class: "list-item__actions" },
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => editarParte(structuredClone(p)) }, "✏️ Abrir"),
        h("button", { class: "btn btn--gold btn--sm", onclick: () => exportarWord(p) }, "📄 Word"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarParte(p) }, "🗑️"))));
  }
  cont.appendChild(cajaLista);
}

function nuevoParte(tipo) {
  const cfg = datos.ajustes[tipo];
  const base = {
    id: idNuevo(),
    tipo,
    fecha: fechaHoy(),
    unidad: datos.ajustes.unidad || "",
    comandante: datos.ajustes.comandante || "",
    columnas: [...cfg.columnas],
    filas: cfg.filas.map((nombre) => ({ nombre, valores: {} })),
    observaciones: "",
    creado: Date.now(),
    actualizado: Date.now(),
    _nuevo: true,
  };
  if (tipo === "tropa") Object.assign(base, {
    parteAl: datos.ajustes.parteAlDef || "",
    lugarFecha: "",
    firmas: {
      firma1Nombre: "", firma1Cargo: datos.ajustes.firma1CargoDef || "2do. Comandante",
      firma2Nombre: "", firma2Cargo: datos.ajustes.firma2CargoDef || "Comandante del Regimiento",
    },
  });
  return base;
}

async function eliminarParte(p) {
  if (!await confirmar(`¿Eliminar el parte de ${p.tipo} del ${fechaLarga(p.fecha)}?`, { titulo: "Eliminar parte", textoOk: "Eliminar", peligro: true })) return;
  datos.lista = datos.lista.filter((x) => x.id !== p.id);
  await persistir();
  toast("Parte eliminado", "");
  renderLista();
}

/* ================= EDITOR ================= */
function editarParte(parte) {
  limpiar(cont);
  if (parte.tipo === "tropa") {
    parte.parteAl ??= ""; parte.lugarFecha ??= "";
    parte.firmas ??= { firma1Nombre: "", firma1Cargo: "2do. Comandante", firma2Nombre: "", firma2Cargo: "Comandante del Regimiento" };
  }

  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, `${parte.tipo === "cuadros" ? "🎖️ Parte de Cuadros" : "🪖 Parte de Tropa"}`),
      h("div", { class: "sub" }, "Completa los datos y las cantidades por estado")),
    h("div", { class: "btn-row" },
      parte.tipo === "tropa" ? h("button", { class: "btn btn--ghost", onclick: () => editarMembrete(parte) }, "🏛️ Membrete") : null,
      h("button", { class: "btn btn--ghost", onclick: renderLista }, "← Volver al historial"))));

  // Datos generales
  const panelDatos = h("div", { class: "panel" }, h("h3", {}, "Datos del parte"));
  const fUnidad = campo("Unidad / Regimiento", "text", parte.unidad, (v) => parte.unidad = v);
  const fFecha = campo("Fecha", "date", parte.fecha, (v) => parte.fecha = v);
  const fCmdte = campo("Elabora / Firma", "text", parte.comandante, (v) => parte.comandante = v);
  panelDatos.appendChild(h("div", { class: "form-row" }, fUnidad, fFecha, fCmdte));

  if (parte.tipo === "tropa") {
    const fParteAl = campo("Parte al…", "text", parte.parteAl, (v) => parte.parteAl = v);
    const fLugarFecha = campo("Lugar y fecha (pie de firma)", "text", parte.lugarFecha, (v) => parte.lugarFecha = v);
    panelDatos.appendChild(h("div", { class: "form-row" }, fParteAl, fLugarFecha));
  }
  cont.appendChild(panelDatos);

  // Matriz
  const panelTabla = h("div", { class: "panel" },
    h("h3", {}, "Estado de fuerza"));
  const wrap = h("div", { class: "tabla-wrap" });
  const tabla = h("table", { class: "data" });
  wrap.appendChild(tabla);
  panelTabla.appendChild(wrap);
  panelTabla.appendChild(h("div", { class: "btn-row mt" },
    h("button", { class: "btn btn--ghost btn--sm", onclick: () => agregarFila(parte, tabla) }, "＋ Agregar fila"),
    h("button", { class: "btn btn--ghost btn--sm", onclick: () => agregarColumna(parte, tabla) }, "＋ Agregar columna (estado)")));
  cont.appendChild(panelTabla);
  pintarTabla(parte, tabla);

  if (parte.tipo === "tropa") {
    const panelFirmas = h("div", { class: "panel" }, h("h3", {}, "Firmas"));
    const f = parte.firmas;
    panelFirmas.appendChild(h("div", { class: "form-row" },
      campo("Nombre (firma 1)", "text", f.firma1Nombre, (v) => f.firma1Nombre = v),
      campo("Cargo (firma 1)", "text", f.firma1Cargo, (v) => f.firma1Cargo = v)));
    panelFirmas.appendChild(h("div", { class: "form-row" },
      campo("Nombre (firma 2)", "text", f.firma2Nombre, (v) => f.firma2Nombre = v),
      campo("Cargo (firma 2)", "text", f.firma2Cargo, (v) => f.firma2Cargo = v)));
    cont.appendChild(panelFirmas);
  }

  // Observaciones / Novedades
  const panelObs = h("div", { class: "panel" }, h("h3", {}, parte.tipo === "tropa" ? "Novedades (reverso — Demostración)" : "Observaciones"));
  if (parte.tipo === "tropa") panelObs.appendChild(h("p", { class: "muted small", style: "margin:0 0 8px" },
    "Escribe aquí quién falta y por qué (grado, nombre, compañía, desde/hasta, motivo). Se imprime en la segunda página del Word, tal como en el formato oficial."));
  const ta = h("textarea", { rows: parte.tipo === "tropa" ? "8" : "3", oninput: (e) => parte.observaciones = e.target.value }, parte.observaciones || "");
  panelObs.appendChild(h("div", { class: "field" }, ta));
  cont.appendChild(panelObs);

  // Acciones
  cont.appendChild(h("div", { class: "btn-row" },
    h("button", { class: "btn btn--primary", onclick: () => guardarParte(parte) }, "💾 Guardar parte"),
    h("button", { class: "btn btn--gold", onclick: () => guardarParte(parte, true) }, "📄 Guardar y exportar a Word"),
    h("button", { class: "btn btn--ghost", onclick: renderLista }, "Cancelar")));
}

function campo(label, tipo, valor, onInput) {
  const input = h("input", { type: tipo, value: valor ?? "", oninput: (e) => onInput(e.target.value) });
  return h("div", { class: "field" }, h("label", {}, label), input);
}

function pintarTabla(parte, tabla) {
  limpiar(tabla);
  // Encabezado
  const thead = h("thead");
  const trh = h("tr");
  trh.appendChild(h("th", {}, parte.tipo === "cuadros" ? "Grado" : "Subunidad"));
  parte.columnas.forEach((c) => {
    trh.appendChild(h("th", { class: "num" },
      h("div", { style: "display:flex;flex-direction:column;align-items:center;gap:2px" },
        h("span", {}, c),
        parte.columnas.length > 1
          ? h("span", { style: "cursor:pointer;color:#f7d9d9;font-size:11px", title: "Quitar columna",
              onclick: () => quitarColumna(parte, tabla, c) }, "✕ quitar")
          : null)));
  });
  thead.appendChild(trh);
  tabla.appendChild(thead);

  // Cuerpo
  const tbody = h("tbody");
  parte.filas.forEach((fila, i) => {
    const tr = h("tr");
    const tdNombre = h("td");
    tdNombre.appendChild(h("div", { style: "display:flex;align-items:center;gap:6px" },
      h("input", { class: "cell", style: "width:150px;text-align:left", value: fila.nombre,
        oninput: (e) => fila.nombre = e.target.value }),
      h("span", { style: "cursor:pointer;color:#b23", title: "Quitar fila",
        onclick: () => { parte.filas.splice(i, 1); pintarTabla(parte, tabla); } }, "✕")));
    tr.appendChild(tdNombre);
    const calculada = esFilaCalculada(parte, fila);
    parte.columnas.forEach((c) => {
      const td = h("td", { class: "num" });
      if (calculada) {
        td.dataset.calc = fila.nombre.trim().toLowerCase();
        td.dataset.col = c;
        td.style.opacity = "0.85";
        td.title = "Calculado automáticamente";
        td.textContent = String(valorCalculadoFila(parte, fila, c));
      } else {
        td.appendChild(h("input", {
          class: "cell", type: "number", min: "0", inputmode: "numeric",
          value: fila.valores[c] ?? "",
          oninput: (e) => { fila.valores[c] = e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0); actualizarTotales(parte, tabla); }
        }));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tabla.appendChild(tbody);

  // Pie con totales
  const tfoot = h("tfoot");
  const trf = h("tr");
  trf.appendChild(h("td", {}, "TOTAL"));
  parte.columnas.forEach((c) => trf.appendChild(h("td", { class: "num", dataset: { total: c } },
    String(parte.tipo === "tropa" ? totalColumnaTropa(parte, c) : totalColumna(parte, c)))));
  tfoot.appendChild(trf);
  tabla.appendChild(tfoot);
}

function actualizarTotales(parte, tabla) {
  parte.columnas.forEach((c) => {
    const td = tabla.querySelector(`tfoot td[data-total="${cssEsc(c)}"]`);
    if (td) td.textContent = String(parte.tipo === "tropa" ? totalColumnaTropa(parte, c) : totalColumna(parte, c));
  });
  if (parte.tipo === "tropa") {
    parte.columnas.forEach((c) => {
      const tdNoForman = tabla.querySelector(`tbody td[data-calc="no forman"][data-col="${cssEsc(c)}"]`);
      if (tdNoForman) tdNoForman.textContent = String(noFormanValor(parte, c));
      const tdForman = tabla.querySelector(`tbody td[data-calc="forman"][data-col="${cssEsc(c)}"]`);
      if (tdForman) tdForman.textContent = String(formanValor(parte, c));
    });
  }
}
function cssEsc(s) { return String(s).replace(/"/g, '\\"'); }

function totalColumna(parte, col) {
  return (parte.filas || []).reduce((s, f) => s + (parseInt(f.valores?.[col]) || 0), 0);
}
function totalFila(parte, fila) {
  return parte.columnas.reduce((s, c) => s + (parseInt(fila.valores?.[c]) || 0), 0);
}

// Parte de Tropa: "No Forman" y "Forman" son calculados, no se cargan a mano.
// No Forman = suma de todas las filas menos Efectivo/No Forman/Forman. Forman = Efectivo - No Forman.
function esNombreFila(fila, nombre) { return (fila?.nombre || "").trim().toLowerCase() === nombre; }
function filaPorNombre(parte, nombre) { return (parte.filas || []).find((f) => esNombreFila(f, nombre)); }
function esFilaCalculada(parte, fila) {
  return parte.tipo === "tropa" && (esNombreFila(fila, "no forman") || esNombreFila(fila, "forman"));
}
function noFormanValor(parte, col) {
  return (parte.filas || []).reduce((s, f) => {
    if (esNombreFila(f, "efectivo") || esNombreFila(f, "no forman") || esNombreFila(f, "forman")) return s;
    return s + (parseInt(f.valores?.[col]) || 0);
  }, 0);
}
function efectivoValor(parte, col) {
  const f = filaPorNombre(parte, "efectivo");
  return f ? (parseInt(f.valores?.[col]) || 0) : 0;
}
function formanValor(parte, col) {
  return Math.max(0, efectivoValor(parte, col) - noFormanValor(parte, col));
}
function valorCalculadoFila(parte, fila, col) {
  if (esNombreFila(fila, "no forman")) return noFormanValor(parte, col);
  if (esNombreFila(fila, "forman")) return formanValor(parte, col);
  return parseInt(fila.valores?.[col]) || 0;
}
// Total por columna del Parte de Tropa: la fila "Efectivo" (línea de verificación, como en el formato oficial), no la suma de todas las filas.
function totalColumnaTropa(parte, col) { return efectivoValor(parte, col); }

async function agregarFila(parte, tabla) {
  parte.filas.push({ nombre: "Nuevo concepto", valores: {} });
  pintarTabla(parte, tabla);
}

async function agregarColumna(parte, tabla) {
  const nombre = await pedirTexto("Nombre del nuevo estado / columna", "Ej.: Licencia, Comisión, Hospital…");
  if (!nombre) return;
  if (parte.columnas.includes(nombre)) { toast("Esa columna ya existe", "err"); return; }
  parte.columnas.push(nombre);
  pintarTabla(parte, tabla);
}

async function quitarColumna(parte, tabla, col) {
  if (!await confirmar(`¿Quitar la columna "${col}"?`, { titulo: "Quitar columna", textoOk: "Quitar", peligro: true })) return;
  parte.columnas = parte.columnas.filter((c) => c !== col);
  parte.filas.forEach((f) => { delete f.valores[col]; });
  pintarTabla(parte, tabla);
}

async function editarMembrete(parte) {
  const m = datos.ajustes.membreteTropa || ["", "", ""];
  const l1 = h("input", { type: "text", value: m[0] || "", placeholder: 'Ej.: OCTAVA DIVISIÓN DEL EJÉRCITO' });
  const l2 = h("input", { type: "text", value: m[1] || "", placeholder: 'Ej.: RPM-2 "TTE. AMEZAGA"' });
  const l3 = h("input", { type: "text", value: m[2] || "", placeholder: "Ej.: BOLIVIA" });
  const r = await modal({
    titulo: "🏛️ Membrete de la unidad",
    cuerpo: h("div", {},
      h("p", { class: "muted small", style: "margin:0 0 10px" }, "Se imprime arriba a la izquierda del Parte de Tropa exportado a Word. Complételo con los datos reales de su unidad (esto es solo un ejemplo del formato, no viene precargado)."),
      h("div", { class: "field" }, h("label", {}, "Línea 1"), l1),
      h("div", { class: "field" }, h("label", {}, "Línea 2"), l2),
      h("div", { class: "field" }, h("label", {}, "Línea 3"), l3)),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      { texto: "💾 Guardar", clase: "btn--primary", valor: "__ok__" },
    ],
  });
  if (r === "__ok__") {
    datos.ajustes.membreteTropa = [l1.value.trim(), l2.value.trim(), l3.value.trim()];
    await persistir();
    toast("Membrete guardado", "ok");
  }
}

async function pedirTexto(titulo, placeholder) {
  const input = h("input", { type: "text", class: "cell", style: "width:100%;text-align:left;padding:10px", placeholder });
  const r = await modal({
    titulo,
    cuerpo: h("div", { class: "field" }, input),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      { texto: "Agregar", clase: "btn--primary", valor: "__ok__" },
    ],
  });
  return r === "__ok__" ? input.value.trim() : null;
}

async function guardarParte(parte, exportar = false) {
  if (!parte.fecha) { toast("Indica la fecha del parte", "err"); return; }
  // Guardar preferencias para próximos partes.
  datos.ajustes.unidad = parte.unidad || datos.ajustes.unidad;
  datos.ajustes.comandante = parte.comandante || datos.ajustes.comandante;
  datos.ajustes[parte.tipo] = { columnas: [...parte.columnas], filas: parte.filas.map((f) => f.nombre) };
  if (parte.tipo === "tropa") {
    datos.ajustes.parteAlDef = parte.parteAl || datos.ajustes.parteAlDef;
    datos.ajustes.firma1CargoDef = parte.firmas.firma1Cargo || datos.ajustes.firma1CargoDef;
    datos.ajustes.firma2CargoDef = parte.firmas.firma2Cargo || datos.ajustes.firma2CargoDef;
  }

  parte.actualizado = Date.now();
  delete parte._nuevo;

  const idx = datos.lista.findIndex((x) => x.id === parte.id);
  if (idx >= 0) datos.lista[idx] = parte; else datos.lista.push(parte);
  await persistir();
  toast("Parte guardado", "ok");

  if (exportar) await exportarWord(parte);
  else renderLista();
}

/* ================= EXPORTAR A WORD ================= */
function construirCuerpoWord(p) {
  const titulo = p.tipo === "cuadros" ? "PARTE DE PERSONAL DE CUADROS" : "PARTE DE PERSONAL DE TROPA";
  let filas = "";
  p.filas.forEach((f) => {
    const celdas = p.columnas.map((c) => `<td class="num">${f.valores[c] ?? 0}</td>`).join("");
    filas += `<tr><td>${escapar(f.nombre)}</td>${celdas}<td class="num">${totalFila(p, f)}</td></tr>`;
  });
  const totalesCols = p.columnas.map((c) => `<td class="num">${totalColumna(p, c)}</td>`).join("");
  const totalGeneral = p.columnas.reduce((s, c) => s + totalColumna(p, c), 0);
  const encColumnas = p.columnas.map((c) => `<th class="num">${escapar(c)}</th>`).join("");

  return `
  <div class="encabezado">
    <div class="unidad">${escapar(p.unidad || "")}</div>
    <h2>${titulo}</h2>
    <div>Fecha: ${escapar(fechaLarga(p.fecha))}</div>
  </div>
  <table>
    <thead>
      <tr><th>${p.tipo === "cuadros" ? "GRADO" : "SUBUNIDAD"}</th>${encColumnas}<th class="num">TOTAL</th></tr>
    </thead>
    <tbody>
      ${filas}
    </tbody>
    <tfoot>
      <tr><td>TOTAL</td>${totalesCols}<td class="num">${totalGeneral}</td></tr>
    </tfoot>
  </table>
  ${p.observaciones ? `<div class="obs"><b>Observaciones:</b><br>${escapar(p.observaciones).replace(/\n/g, "<br>")}</div>` : ""}
  <div class="firma">
    <div class="linea"></div>
    <div>${escapar(p.comandante || "")}</div>
    <div class="small">2do Comandante</div>
  </div>`;
}

// Opciones de página del formato oficial de Parte de Tropa (tamaño carta, márgenes del documento de referencia).
const OPTS_TROPA = { size: "21.59cm 27.94cm", margin: "0.75cm 2cm 1cm 2.75cm", font: '"Arial", sans-serif', fontSize: "10pt" };

function firmaBloque(nombre, cargo) {
  return `<td style="border:none;text-align:center;width:50%;padding-top:0">
    <div style="border-top:1px solid #000;width:190pt;margin:0 auto 3pt"></div>
    <div style="font-weight:bold">${escapar(nombre || "")}</div>
    <div class="small">${escapar(cargo)}</div>
  </td>`;
}

// Replica el formato oficial del Parte de Tropa (membrete de la unidad + tabla por compañía + reverso "Demostración").
function construirCuerpoWordTropaOficial(p) {
  const m = datos.ajustes.membreteTropa || ["", "", ""];
  let filas = "";
  p.filas.forEach((f) => {
    const celdas = p.columnas.map((c) => `<td class="num">${valorCalculadoFila(p, f, c)}</td>`).join("");
    const totalF = p.columnas.reduce((s, c) => s + valorCalculadoFila(p, f, c), 0);
    filas += `<tr><td>${escapar(f.nombre)}</td>${celdas}<td class="num">${totalF}</td></tr>`;
  });
  const totalesCols = p.columnas.map((c) => `<td class="num">${totalColumnaTropa(p, c)}</td>`).join("");
  const totalGeneral = p.columnas.reduce((s, c) => s + totalColumnaTropa(p, c), 0);
  const encColumnas = p.columnas.map((c) => `<th class="num">${escapar(c)}</th>`).join("");
  const fi = p.firmas || {};

  return `
  <div style="font-weight:bold;font-size:10pt;line-height:1.15">
    ${m.map((l) => l ? `<div>${escapar(l)}</div>` : "").join("")}
  </div>
  <h1 style="margin-top:10pt">PARTE DE RELEVO</h1>
  ${p.parteAl ? `<div style="text-align:center">${escapar(p.parteAl)}</div>` : ""}
  <table style="margin-top:12pt">
    <thead><tr><th>DETALLE</th>${encColumnas}<th class="num">TOTAL</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td>TOTAL</td>${totalesCols}<td class="num">${totalGeneral}</td></tr></tfoot>
  </table>
  ${p.lugarFecha ? `<div style="text-align:center;margin-top:20pt">${escapar(p.lugarFecha)}</div>` : ""}
  <table style="border:none;width:100%;margin-top:40pt"><tr>
    ${firmaBloque(fi.firma1Nombre, fi.firma1Cargo || "")}
    ${firmaBloque(fi.firma2Nombre, fi.firma2Cargo || "")}
  </tr></table>
  <div style="page-break-before:always">
    <h2>DEMOSTRACIÓN</h2>
    <div>${p.observaciones ? escapar(p.observaciones).replace(/\n/g, "<br>") : '<span class="small">Sin novedades.</span>'}</div>
  </div>`;
}

async function exportarWord(p) {
  const nombreArchivo = `Parte_${p.tipo}_${p.fecha}.doc`;
  const tituloDoc = `Parte de ${p.tipo} ${p.fecha}`;
  const blob = p.tipo === "tropa"
    ? blobWord(tituloDoc, construirCuerpoWordTropaOficial(p), OPTS_TROPA)
    : blobWord(tituloDoc, construirCuerpoWord(p));

  // Descargar siempre.
  descargar(blob, nombreArchivo);

  // Guardar copia en la carpeta de datos (subcarpeta "Partes") si hay carpeta.
  try {
    const est = ctx.store.estado();
    if (est.modo === "carpeta") {
      await ctx.store.guardarArchivo("Partes", nombreArchivo, blob);
      toast("Word exportado y guardado en la carpeta “Partes”", "ok");
    } else {
      toast("Word exportado (descarga)", "ok");
    }
  } catch (e) {
    console.error(e);
    toast("Word descargado (no se pudo guardar copia en carpeta)", "");
  }
}
