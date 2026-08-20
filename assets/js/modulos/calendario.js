/*
 * calendario.js — Módulo "Calendario de Actividades".
 *
 * Cuadrícula de mes real. Cada casilla de fecha puede tener actividades y/o
 * pendientes; si hay un pendiente sin completar, la casilla se marca con un
 * punto de alerta. Al tocar una fecha se abre el panel con el detalle del día.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, idNuevo } from "../ui.js";

const ARCHIVO = "calendario";
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

let ctx, cont, datos;
let mesRef;
let diaSel;

export async function calendarioModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || { items: [] };
  if (!datos.items) datos.items = [];
  const hoy = new Date();
  mesRef = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  diaSel = fechaHoy();
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

function isoDia(y, m, d) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function itemsDe(fecha) { return datos.items.filter((i) => i.fecha === fecha); }
function fechaLargaSimple(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

function nuevoItem(fecha) {
  return { id: idNuevo(), fecha: fecha || fechaHoy(), hora: "", titulo: "", tipo: "actividad", completado: false, descripcion: "", creado: Date.now() };
}

/* =================== RENDER =================== */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "📅 Calendario de Actividades"),
      h("div", { class: "sub" }, "Marca actividades y pendientes en cada fecha")),
    h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevoItem(diaSel), true) }, "＋ Agregar")));

  cont.appendChild(pintarNav());
  cont.appendChild(pintarGrid());
  cont.appendChild(pintarPanelDia());
}

function pintarNav() {
  return h("div", { class: "cal-nav" },
    h("button", { class: "btn btn--ghost btn--sm", onclick: () => { mesRef = new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1); render(); } }, "‹"),
    h("h3", {}, `${MESES[mesRef.getMonth()]} ${mesRef.getFullYear()}`),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--ghost btn--sm", onclick: () => { const h2 = new Date(); mesRef = new Date(h2.getFullYear(), h2.getMonth(), 1); diaSel = fechaHoy(); render(); } }, "Hoy"),
      h("button", { class: "btn btn--ghost btn--sm", onclick: () => { mesRef = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1); render(); } }, "›")));
}

function pintarGrid() {
  const grid = h("div", { class: "cal-grid" });
  for (const d of DIAS_SEMANA) grid.appendChild(h("div", { class: "cal-dow" }, d));

  const y = mesRef.getFullYear(), m = mesRef.getMonth();
  const primerDiaSemana = (new Date(y, m, 1).getDay() + 6) % 7;
  const diasEnMes = new Date(y, m + 1, 0).getDate();
  const hoy = fechaHoy();

  for (let i = 0; i < primerDiaSemana; i++) grid.appendChild(h("div", { class: "cal-day cal-day--fuera" }));

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = isoDia(y, m, d);
    const items = itemsDe(fecha);
    const tienePendiente = items.some((i) => i.tipo === "pendiente" && !i.completado);
    const tieneActividad = items.some((i) => i.tipo !== "pendiente" || i.completado);
    const clases = ["cal-day"];
    if (fecha === hoy) clases.push("cal-day--hoy");
    if (fecha === diaSel) clases.push("cal-day--sel");
    const celda = h("div", { class: clases.join(" "), onclick: () => { diaSel = fecha; render(); } }, String(d));
    if (items.length) {
      const dots = h("div", { class: "cal-dots" });
      if (tienePendiente) dots.appendChild(h("span", { class: "cal-dot cal-dot--pendiente" }));
      if (tieneActividad) dots.appendChild(h("span", { class: "cal-dot cal-dot--actividad" }));
      celda.appendChild(dots);
    }
    grid.appendChild(celda);
  }
  return grid;
}

function pintarPanelDia() {
  const panel = h("div", { class: "panel", style: "margin-top:16px" });
  const items = itemsDe(diaSel).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  panel.appendChild(h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px" },
    h("h3", { style: "margin:0;border:none;padding:0" }, fechaLargaSimple(diaSel)),
    h("button", { class: "btn btn--primary btn--sm", onclick: () => abrirEditor(nuevoItem(diaSel), true) }, "＋ Agregar aquí")));

  if (!items.length) {
    panel.appendChild(h("p", { class: "muted", style: "text-align:center;padding:10px" }, "Sin actividades ni pendientes para este día."));
    return panel;
  }
  const lista = h("div", { class: "list" });
  for (const it of items) {
    lista.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" },
          it.tipo === "pendiente" ? (it.completado ? "✅ " : "🔴 ") : "🔷 ",
          it.hora ? `${it.hora} — ` : "", it.titulo || "Sin título"),
        it.descripcion ? h("span", { class: "list-item__meta" }, it.descripcion) : null),
      h("div", { class: "list-item__actions" },
        it.tipo === "pendiente" ? h("button", { class: "btn btn--ghost btn--sm", onclick: () => marcarCompletado(it) }, it.completado ? "↩️" : "✅") : null,
        h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditor(structuredClone(it), false) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarItem(it) }, "🗑️"))));
  }
  panel.appendChild(lista);
  return panel;
}

/* =================== EDITAR =================== */
function abrirEditor(item, esNueva) {
  const fecha = h("input", { type: "date", value: item.fecha });
  const hora = h("input", { type: "time", value: item.hora || "" });
  const tipo = h("select", {},
    h("option", { value: "actividad", selected: item.tipo !== "pendiente" }, "Actividad"),
    h("option", { value: "pendiente", selected: item.tipo === "pendiente" }, "Pendiente"));
  const titulo = h("input", { type: "text", value: item.titulo || "", placeholder: "Ej.: Instrucción de tiro, entrega de informe…" });
  const desc = h("textarea", { rows: "3", placeholder: "Detalles (opcional)" }, item.descripcion || "");

  const cuerpo = h("div", {},
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Fecha"), fecha),
      h("div", { class: "field" }, h("label", {}, "Hora (opcional)"), hora)),
    h("div", { class: "field", style: "margin:12px 0" }, h("label", {}, "Tipo"), tipo),
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Título"), titulo),
    h("div", { class: "field" }, h("label", {}, "Detalles"), desc));

  const acciones = [
    { texto: "Cancelar", clase: "btn--ghost", valor: null },
    {
      texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
      onClick: () => {
        if (!fecha.value) { toast("Indica una fecha", "err"); return false; }
        if (!titulo.value.trim()) { toast("Indica un título", "err"); return false; }
        Object.assign(item, { fecha: fecha.value, hora: hora.value, tipo: tipo.value, titulo: titulo.value.trim(), descripcion: desc.value.trim() });
        if (esNueva) datos.items.push(item);
        else { const idx = datos.items.findIndex((x) => x.id === item.id); if (idx >= 0) datos.items[idx] = item; }
        persistir().then(() => {
          diaSel = item.fecha;
          const [ay, am] = item.fecha.split("-").map(Number);
          mesRef = new Date(ay, am - 1, 1);
          toast("Guardado", "ok"); render();
        });
      },
    },
  ];
  if (!esNueva) {
    acciones.splice(1, 0, { texto: "🗑️ Eliminar", clase: "btn--danger", valor: "del", onClick: () => eliminarItem(item, true) });
  }
  modal({ titulo: esNueva ? "＋ Agregar al calendario" : "✏️ Editar", cuerpo, acciones });
}

async function marcarCompletado(it) {
  it.completado = !it.completado;
  await persistir();
  render();
}

async function eliminarItem(it, desdeEditor = false) {
  if (!desdeEditor && !await confirmar(`¿Eliminar "${it.titulo || "Sin título"}"?`, { titulo: "Eliminar", textoOk: "Eliminar", peligro: true })) return;
  datos.items = datos.items.filter((x) => x.id !== it.id);
  await persistir();
  toast("Eliminado", "");
  render();
}
