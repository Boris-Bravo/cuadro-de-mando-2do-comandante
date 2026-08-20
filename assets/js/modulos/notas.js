/*
 * notas.js — Módulo "Bloc de Notas".
 *
 * Apuntes libres, organizados por fecha, para tomar y revisar cuando se
 * necesite. Independiente del calendario y del seguimiento de documentación.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";

const ARCHIVO = "notas";

let ctx, cont, datos;
let fTexto = "";

export async function notasModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || { lista: [] };
  if (!datos.lista) datos.lista = [];
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

function nuevaNota() { return { id: idNuevo(), fecha: fechaHoy(), titulo: "", contenido: "", creado: Date.now(), actualizado: Date.now() }; }

function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "📝 Bloc de Notas"), h("div", { class: "sub" }, "Tus apuntes, organizados por fecha")),
    h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevaNota(), true) }, "＋ Nueva nota")));

  cont.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" },
      h("input", { type: "search", placeholder: "Buscar en tus notas…", value: fTexto,
        oninput: (e) => { fTexto = e.target.value; repintar(); } }))));

  const wrap = h("div", { id: "notasWrap" });
  cont.appendChild(wrap);
  repintar();
}

function filtradas() {
  const t = fTexto.trim().toLowerCase();
  return datos.lista
    .filter((n) => !t || [n.titulo, n.contenido].some((x) => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.actualizado || 0) - (a.actualizado || 0));
}

function repintar() {
  const wrap = document.getElementById("notasWrap");
  if (!wrap) return;
  limpiar(wrap);
  const lista = filtradas();
  if (!lista.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "📝"),
      h("p", {}, datos.lista.length ? "No hay notas que coincidan." : "Aún no hay notas."),
      h("p", { class: "muted" }, "Escribe la primera con “Nueva nota”.")));
    return;
  }
  let fechaActual = null;
  for (const n of lista) {
    if (n.fecha !== fechaActual) {
      fechaActual = n.fecha;
      wrap.appendChild(h("h3", { style: "margin:18px 0 8px;color:var(--verde-800)" }, n.fecha ? fechaLarga(n.fecha) : "Sin fecha"));
    }
    wrap.appendChild(h("div", { class: "list-item", style: "cursor:pointer;align-items:flex-start", onclick: () => abrirEditor(structuredClone(n), false) },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, n.titulo || "Sin título"),
        h("span", { class: "list-item__meta" }, (n.contenido || "").slice(0, 140) || "Sin contenido"))));
  }
}

function abrirEditor(nota, esNueva) {
  const fecha = h("input", { type: "date", value: nota.fecha || fechaHoy() });
  const titulo = h("input", { type: "text", value: nota.titulo || "", placeholder: "Título de la nota" });
  const contenido = h("textarea", { rows: "10", placeholder: "Escribe aquí tus apuntes…" }, nota.contenido || "");
  const cuerpo = h("div", {},
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Fecha"), fecha),
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Título"), titulo),
    h("div", { class: "field" }, h("label", {}, "Apunte"), contenido));

  const acciones = [
    { texto: "Cancelar", clase: "btn--ghost", valor: null },
    {
      texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
      onClick: () => {
        if (!titulo.value.trim() && !contenido.value.trim()) { toast("La nota está vacía", "err"); return false; }
        Object.assign(nota, { fecha: fecha.value || fechaHoy(), titulo: titulo.value.trim(), contenido: contenido.value.trim(), actualizado: Date.now() });
        if (esNueva) datos.lista.push(nota);
        else { const idx = datos.lista.findIndex((x) => x.id === nota.id); if (idx >= 0) datos.lista[idx] = nota; }
        persistir().then(() => { toast("Nota guardada", "ok"); render(); });
      },
    },
  ];
  if (!esNueva) {
    acciones.splice(1, 0, {
      texto: "🗑️ Eliminar", clase: "btn--danger", valor: "del",
      onClick: () => {
        datos.lista = datos.lista.filter((x) => x.id !== nota.id);
        persistir().then(() => { toast("Nota eliminada", ""); render(); });
      },
    });
  }
  modal({ titulo: esNueva ? "📝 Nueva nota" : "✏️ Editar nota", cuerpo, acciones });
}
