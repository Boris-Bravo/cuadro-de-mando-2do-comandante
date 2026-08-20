/*
 * calendario.js — Módulo "Calendario de Actividades".
 *
 * Dos secciones independientes, aparte del seguimiento de documentación:
 *  - Agenda: actividades registradas por fecha y hora.
 *  - Bloc de notas: apuntes libres para tomar y revisar cuando se necesite.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";

const ARCHIVO = "calendario";

let ctx, cont, datos;
let tab = "agenda";
let fTextoNotas = "";

export async function calendarioModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || { actividades: [], notas: [] };
  if (!datos.actividades) datos.actividades = [];
  if (!datos.notas) datos.notas = [];
  tab = "agenda";
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

/* =================== RENDER RAÍZ =================== */
function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "📅 Calendario de Actividades"),
      h("div", { class: "sub" }, "Agenda de actividades y bloc de notas, aparte del seguimiento de documentación")),
    h("div", { class: "btn-row" },
      tab === "agenda"
        ? h("button", { class: "btn btn--primary", onclick: () => abrirEditorActividad(nuevaActividad(), true) }, "＋ Nueva actividad")
        : h("button", { class: "btn btn--primary", onclick: () => abrirEditorNota(nuevaNota(), true) }, "＋ Nueva nota"))));

  const chips = h("div", { class: "chips", style: "margin-bottom:14px" },
    h("span", { class: `chip ${tab === "agenda" ? "active" : ""}`, onclick: () => { tab = "agenda"; render(); } }, `📅 Agenda (${datos.actividades.length})`),
    h("span", { class: `chip ${tab === "notas" ? "active" : ""}`, onclick: () => { tab = "notas"; render(); } }, `📝 Bloc de notas (${datos.notas.length})`));
  cont.appendChild(chips);

  const wrap = h("div", { id: "calWrap" });
  cont.appendChild(wrap);
  if (tab === "agenda") repintarAgenda(); else repintarNotas();
}

/* =================== AGENDA =================== */
function nuevaActividad() {
  return { id: idNuevo(), fecha: fechaHoy(), hora: "", titulo: "", descripcion: "", creado: Date.now() };
}

function repintarAgenda() {
  const wrap = document.getElementById("calWrap");
  if (!wrap) return;
  limpiar(wrap);
  const lista = datos.actividades.slice().sort((a, b) => (a.fecha + (a.hora || "00:00")).localeCompare(b.fecha + (b.hora || "00:00")));
  if (!lista.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "📅"),
      h("p", {}, "Aún no hay actividades registradas."),
      h("p", { class: "muted" }, "Agrega la primera con “Nueva actividad”.")));
    return;
  }
  const hoy = fechaHoy();
  let fechaActual = null;
  for (const act of lista) {
    if (act.fecha !== fechaActual) {
      fechaActual = act.fecha;
      const etiqueta = act.fecha === hoy ? "Hoy" : fechaLarga(act.fecha);
      wrap.appendChild(h("h3", { style: `margin:18px 0 8px;color:${act.fecha < hoy ? "var(--texto-suave)" : "var(--verde-800)"}` }, etiqueta));
    }
    wrap.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, act.hora ? `🕒 ${act.hora} — ${act.titulo || "Sin título"}` : (act.titulo || "Sin título")),
        act.descripcion ? h("span", { class: "list-item__meta" }, act.descripcion) : null),
      h("div", { class: "list-item__actions" },
        h("button", { class: "btn btn--gold btn--sm", onclick: () => abrirEditorActividad(structuredClone(act), false) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarActividad(act) }, "🗑️"))));
  }
}

function abrirEditorActividad(act, esNueva) {
  const fecha = h("input", { type: "date", value: act.fecha || fechaHoy() });
  const hora = h("input", { type: "time", value: act.hora || "" });
  const titulo = h("input", { type: "text", value: act.titulo || "", placeholder: "Ej.: Instrucción de tiro, formación, revista…" });
  const desc = h("textarea", { rows: "3", placeholder: "Detalles (opcional)" }, act.descripcion || "");
  const cuerpo = h("div", {},
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Fecha"), fecha),
      h("div", { class: "field" }, h("label", {}, "Hora (opcional)"), hora)),
    h("div", { class: "field", style: "margin:12px 0" }, h("label", {}, "Actividad"), titulo),
    h("div", { class: "field" }, h("label", {}, "Detalles"), desc));

  modal({
    titulo: esNueva ? "📅 Nueva actividad" : "✏️ Editar actividad",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          if (!fecha.value) { toast("Indica una fecha", "err"); return false; }
          if (!titulo.value.trim()) { toast("Indica un título para la actividad", "err"); return false; }
          Object.assign(act, { fecha: fecha.value, hora: hora.value, titulo: titulo.value.trim(), descripcion: desc.value.trim() });
          if (esNueva) datos.actividades.push(act);
          else { const idx = datos.actividades.findIndex((x) => x.id === act.id); if (idx >= 0) datos.actividades[idx] = act; }
          persistir().then(() => { toast("Actividad guardada", "ok"); render(); });
        },
      },
    ],
  });
}

async function eliminarActividad(act) {
  if (!await confirmar(`¿Eliminar la actividad "${act.titulo || "Sin título"}"?`, { titulo: "Eliminar actividad", textoOk: "Eliminar", peligro: true })) return;
  datos.actividades = datos.actividades.filter((x) => x.id !== act.id);
  await persistir();
  toast("Actividad eliminada", "");
  render();
}

/* =================== BLOC DE NOTAS =================== */
function nuevaNota() {
  return { id: idNuevo(), titulo: "", contenido: "", creado: Date.now(), actualizado: Date.now() };
}

function notasFiltradas() {
  const t = fTextoNotas.trim().toLowerCase();
  return datos.notas
    .filter((n) => !t || [n.titulo, n.contenido].some((x) => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));
}

function repintarNotas() {
  const wrap = document.getElementById("calWrap");
  if (!wrap) return;
  limpiar(wrap);

  wrap.appendChild(h("div", { class: "form-row", style: "margin-bottom:14px" },
    h("div", { class: "field" },
      h("input", { type: "search", placeholder: "Buscar en tus notas…", value: fTextoNotas,
        oninput: (e) => { fTextoNotas = e.target.value; repintarNotas(); } }))));

  const lista = notasFiltradas();
  if (!lista.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "📝"),
      h("p", {}, datos.notas.length ? "No hay notas que coincidan." : "Aún no hay notas."),
      h("p", { class: "muted" }, "Escribe la primera con “Nueva nota”.")));
    return;
  }
  const grid = h("div", { class: "grid-modulos" });
  for (const n of lista) {
    const fechaRef = new Date(n.actualizado || n.creado || Date.now());
    const fechaIso = `${fechaRef.getFullYear()}-${String(fechaRef.getMonth() + 1).padStart(2, "0")}-${String(fechaRef.getDate()).padStart(2, "0")}`;
    grid.appendChild(h("div", { class: "modulo-card", style: "min-height:auto;cursor:pointer", onclick: () => abrirEditorNota(structuredClone(n), false) },
      h("h3", { class: "modulo-card__title", style: "font-size:16px" }, n.titulo || "Sin título"),
      h("p", { class: "modulo-card__desc" }, (n.contenido || "").slice(0, 140) || "Sin contenido"),
      h("div", { class: "muted small", style: "margin-top:6px" }, fechaLarga(fechaIso))));
  }
  wrap.appendChild(grid);
}

function abrirEditorNota(nota, esNueva) {
  const titulo = h("input", { type: "text", value: nota.titulo || "", placeholder: "Título de la nota" });
  const contenido = h("textarea", { rows: "10", placeholder: "Escribe aquí tus apuntes…" }, nota.contenido || "");
  const cuerpo = h("div", {},
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Título"), titulo),
    h("div", { class: "field" }, h("label", {}, "Apunte"), contenido));

  const acciones = [
    { texto: "Cancelar", clase: "btn--ghost", valor: null },
    {
      texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
      onClick: () => {
        if (!titulo.value.trim() && !contenido.value.trim()) { toast("La nota está vacía", "err"); return false; }
        Object.assign(nota, { titulo: titulo.value.trim(), contenido: contenido.value.trim(), actualizado: Date.now() });
        if (esNueva) datos.notas.push(nota);
        else { const idx = datos.notas.findIndex((x) => x.id === nota.id); if (idx >= 0) datos.notas[idx] = nota; }
        persistir().then(() => { toast("Nota guardada", "ok"); render(); });
      },
    },
  ];
  if (!esNueva) {
    acciones.splice(1, 0, {
      texto: "🗑️ Eliminar", clase: "btn--danger", valor: "del",
      onClick: () => {
        datos.notas = datos.notas.filter((x) => x.id !== nota.id);
        persistir().then(() => { toast("Nota eliminada", ""); render(); });
      },
    });
  }

  modal({ titulo: esNueva ? "📝 Nueva nota" : "✏️ Editar nota", cuerpo, acciones });
}
