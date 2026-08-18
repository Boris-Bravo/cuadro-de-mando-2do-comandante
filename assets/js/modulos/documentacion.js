/*
 * documentacion.js — Módulo "Seguimiento de Documentación".
 *
 * Controla la documentación ENTRANTE y SALIENTE por campos de la conducción
 * (P-1, P-2, P-3, P-4, P-5 … ampliables), con estado (pendiente / en trámite /
 * cumplido), plazos (vencimiento automático), proveído y observaciones.
 * Guarda en documentacion.json y permite exportar la lista filtrada a Word.
 */
import { h, limpiar, toast, modal, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";
import { blobWord, descargar, escapar } from "../export-word.js";

const ARCHIVO = "documentacion";
const CAMPOS_DEF = ["P-1", "P-2", "P-3", "P-4", "P-5"];
const ESTADOS = [
  { id: "pendiente", txt: "Pendiente" },
  { id: "tramite", txt: "En trámite" },
  { id: "cumplido", txt: "Cumplido" },
];

let ctx, cont, datos;
let f = { tipo: "todos", campo: "todos", estado: "todos", texto: "" };

function baseVacia() {
  return { ajustes: { campos: [...CAMPOS_DEF], diasAlerta: 3 }, lista: [] };
}

export async function documentacionModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || baseVacia();
  if (!datos.ajustes) datos.ajustes = { campos: [...CAMPOS_DEF], diasAlerta: 3 };
  if (!datos.ajustes.diasAlerta) datos.ajustes.diasAlerta = 3;
  if (!datos.lista) datos.lista = [];
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

/* ---------- Plazos ---------- */
function diasAlerta() { return (datos.ajustes && datos.ajustes.diasAlerta) || 3; }

// Días que faltan para el plazo (negativo = ya vencido). null si no hay plazo.
function diasRestantes(plazo) {
  if (!plazo) return null;
  const [a, m, d] = plazo.split("-").map(Number);
  const p = new Date(a, m - 1, d);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((p - hoy) / 86400000);
}

/* ---------- Estado derivado (vencimiento + alarma de proximidad) ---------- */
function estadoInfo(d) {
  if (d.estado === "cumplido") return { txt: "Cumplido", cls: "tag--ok", clave: "cumplido" };
  const dr = diasRestantes(d.plazo);
  if (dr !== null && dr < 0) return { txt: `Vencido (${Math.abs(dr)}d)`, cls: "tag--venc", clave: "vencido" };
  if (dr !== null && dr <= diasAlerta()) {
    return { txt: dr === 0 ? "⏰ Vence hoy" : `⏰ Vence en ${dr}d`, cls: "tag--porvencer", clave: "porvencer" };
  }
  if (d.estado === "tramite") return { txt: "En trámite", cls: "tag--pend", clave: "tramite" };
  return { txt: "Pendiente", cls: "tag--pend", clave: "pendiente" };
}

// Banner de alarma cuando hay documentos vencidos o próximos a vencer.
function bannerAlarma() {
  const criticos = datos.lista.filter((d) => {
    const c = estadoInfo(d).clave; return c === "vencido" || c === "porvencer";
  });
  if (!criticos.length) return null;
  const nVenc = criticos.filter((d) => estadoInfo(d).clave === "vencido").length;
  const nProx = criticos.filter((d) => estadoInfo(d).clave === "porvencer").length;
  criticos.sort((a, b) => (diasRestantes(a.plazo) ?? 999) - (diasRestantes(b.plazo) ?? 999));

  const listaEl = h("div", { class: "alarma__lista" });
  criticos.slice(0, 4).forEach((d) => {
    const dr = diasRestantes(d.plazo);
    const cuando = dr < 0 ? `vencido hace ${Math.abs(dr)} día(s)` : dr === 0 ? "vence HOY" : `vence en ${dr} día(s)`;
    listaEl.appendChild(h("div", { class: "alarma__item" },
      h("b", {}, `${d.campo} · ${d.referencia || d.asunto || "documento"}`), ` — ${cuando}`));
  });

  return h("div", { class: "alarma" },
    h("div", { class: "alarma__icono" }, "🚨"),
    h("div", { class: "alarma__texto" },
      h("div", { class: "alarma__titulo" }, "Atención: plazos por cumplir"),
      h("div", { class: "alarma__detalle" },
        `${nVenc} vencido(s) y ${nProx} próximo(s) a vencer (≤ ${diasAlerta()} día(s)).`),
      listaEl),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--danger btn--sm", onclick: () => { f.estado = "vencido"; render(); } }, "Ver vencidos"),
      h("button", { class: "btn btn--gold btn--sm", onclick: () => { f.estado = "porvencer"; render(); } }, "Ver por vencer")));
}

/* ---------- Render principal ---------- */
function render() {
  limpiar(cont);

  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "🗂️ Seguimiento de Documentación"),
      h("div", { class: "sub" }, "Entrante y saliente por campos de la conducción")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--primary", onclick: () => editarDoc(nuevoDoc("entrante")) }, "＋ Entrante"),
      h("button", { class: "btn btn--gold", onclick: () => editarDoc(nuevoDoc("saliente")) }, "＋ Saliente"),
      h("button", { class: "btn btn--ghost", onclick: gestionarCampos }, "⚙️ Campos"))));

  // Banner de alarma (vencidos / próximos a vencer)
  const banner = bannerAlarma();
  if (banner) cont.appendChild(banner);

  // Resumen
  const total = datos.lista.length;
  const cont_ = { pendiente: 0, tramite: 0, porvencer: 0, vencido: 0, cumplido: 0 };
  datos.lista.forEach((d) => cont_[estadoInfo(d).clave]++);
  cont.appendChild(h("div", { class: "chips", style: "margin-bottom:14px" },
    resumenChip("📄 Total", total, "var(--cyan)"),
    resumenChip("⏳ Pendientes", cont_.pendiente, "#ffca6e"),
    resumenChip("🔄 En trámite", cont_.tramite, "#ffca6e"),
    resumenChip("⏰ Por vencer", cont_.porvencer, "#ffb02e"),
    resumenChip("⚠️ Vencidos", cont_.vencido, "var(--rojo-claro)"),
    resumenChip("✅ Cumplidos", cont_.cumplido, "#7ff0ad")));

  // Filtros
  const panelF = h("div", { class: "panel", style: "padding:14px 18px" });
  const fila = h("div", { class: "form-row", style: "margin:0;align-items:flex-end" });
  // tipo
  fila.appendChild(selectFiltro("Tipo", [["todos", "Todos"], ["entrante", "Entrante"], ["saliente", "Saliente"]], f.tipo, (v) => { f.tipo = v; render(); }));
  // campo
  fila.appendChild(selectFiltro("Campo", [["todos", "Todos"], ...datos.ajustes.campos.map((c) => [c, c])], f.campo, (v) => { f.campo = v; render(); }));
  // estado
  fila.appendChild(selectFiltro("Estado", [["todos", "Todos"], ["pendiente", "Pendiente"], ["tramite", "En trámite"], ["porvencer", "Por vencer"], ["vencido", "Vencido"], ["cumplido", "Cumplido"]], f.estado, (v) => { f.estado = v; render(); }));
  // días de alerta
  const diasInp = h("input", { type: "number", min: "1", max: "60", value: diasAlerta(),
    onchange: (e) => { datos.ajustes.diasAlerta = Math.max(1, parseInt(e.target.value) || 3); persistir(); render(); } });
  fila.appendChild(h("div", { class: "field", style: "flex:0 0 110px" }, h("label", {}, "Alerta (días)"), diasInp));
  // busqueda
  const inp = h("input", { type: "search", placeholder: "Buscar referencia, asunto…", value: f.texto, oninput: (e) => { f.texto = e.target.value; repintarTabla(); } });
  fila.appendChild(h("div", { class: "field" }, h("label", {}, "Buscar"), inp));
  // exportar
  fila.appendChild(h("div", { class: "field", style: "flex:0 0 auto" }, h("label", { style: "visibility:hidden" }, "."),
    h("button", { class: "btn btn--ghost", onclick: exportarWord }, "📄 Exportar a Word")));
  panelF.appendChild(fila);
  cont.appendChild(panelF);

  // Tabla
  const wrap = h("div", { id: "docTablaWrap" });
  cont.appendChild(wrap);
  repintarTabla();
}

function resumenChip(txt, n, color) {
  return h("span", { class: "chip", style: `cursor:default;border-left:4px solid ${color}` },
    h("b", { style: `color:${color}` }, String(n)), " " + txt);
}

function selectFiltro(label, opciones, valor, onChange) {
  const sel = h("select", { onchange: (e) => onChange(e.target.value) });
  opciones.forEach(([v, t]) => sel.appendChild(h("option", { value: v, selected: v === valor }, t)));
  return h("div", { class: "field", style: "flex:1 1 130px" }, h("label", {}, label), sel);
}

function docsFiltrados() {
  const t = f.texto.trim().toLowerCase();
  return datos.lista
    .filter((d) => f.tipo === "todos" || d.tipo === f.tipo)
    .filter((d) => f.campo === "todos" || d.campo === f.campo)
    .filter((d) => f.estado === "todos" || estadoInfo(d).clave === f.estado)
    .filter((d) => !t || [d.referencia, d.asunto, d.contraparte, d.proveido].some((x) => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado || 0) - (a.creado || 0));
}

function repintarTabla() {
  const wrap = document.getElementById("docTablaWrap");
  if (!wrap) return;
  limpiar(wrap);
  const lista = docsFiltrados();

  if (!lista.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "🗂️"),
      h("p", {}, datos.lista.length ? "No hay documentos que coincidan con el filtro." : "Aún no hay documentos registrados."),
      h("p", { class: "muted" }, "Agrega uno con los botones “Entrante” o “Saliente”.")));
    return;
  }

  const tabla = h("table", { class: "data" });
  tabla.appendChild(h("thead", {}, h("tr", {},
    h("th", {}, "Tipo"), h("th", {}, "Campo"), h("th", {}, "Referencia"),
    h("th", {}, "Fecha"), h("th", {}, "Origen / Destino"), h("th", {}, "Asunto"),
    h("th", {}, "Plazo"), h("th", {}, "Estado"), h("th", {}, "Acciones"))));
  const tbody = h("tbody");
  for (const d of lista) {
    const est = estadoInfo(d);
    tbody.appendChild(h("tr", {},
      h("td", {}, h("span", { class: "tag", style: d.tipo === "entrante" ? "background:rgba(59,74,40,.15);color:var(--verde-700)" : "background:rgba(212,175,55,.2);color:#8a6d12" }, d.tipo === "entrante" ? "⬇ Entrante" : "⬆ Saliente")),
      h("td", {}, d.campo || "—"),
      h("td", {}, d.referencia || "—"),
      h("td", {}, d.fecha ? fechaCorta(d.fecha) : "—"),
      h("td", {}, d.contraparte || "—"),
      h("td", { style: "max-width:220px" }, d.asunto || "—"),
      h("td", {}, d.plazo ? fechaCorta(d.plazo) : "—"),
      h("td", {}, h("span", { class: `tag ${est.cls}` }, est.txt)),
      h("td", {}, h("div", { style: "display:flex;gap:6px" },
        h("button", { class: "btn btn--ghost btn--sm", title: "Ver / editar", onclick: () => editarDoc(structuredClone(d)) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", title: "Eliminar", onclick: () => eliminarDoc(d) }, "🗑️")))));
  }
  tabla.appendChild(tbody);
  wrap.appendChild(h("div", { class: "tabla-wrap" }, tabla));
}

function fechaCorta(iso) { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }

/* ---------- Crear / editar ---------- */
function nuevoDoc(tipo) {
  return {
    id: idNuevo(), tipo,
    campo: datos.ajustes.campos[0] || "P-1",
    referencia: "", fecha: fechaHoy(), contraparte: "", asunto: "",
    plazo: "", estado: "pendiente", proveido: "", observaciones: "",
    creado: Date.now(), actualizado: Date.now(),
  };
}

function editarDoc(d) {
  const esEntrante = d.tipo === "entrante";
  const form = {};
  const cuerpo = h("div", {});

  const filaTipoCampo = h("div", { class: "form-row" });
  // Tipo (editable)
  const selTipo = h("select", {}, ...[["entrante", "Entrante"], ["saliente", "Saliente"]].map(([v, t]) => h("option", { value: v, selected: v === d.tipo }, t)));
  filaTipoCampo.appendChild(h("div", { class: "field" }, h("label", {}, "Tipo"), selTipo));
  // Campo
  const selCampo = h("select", {}, ...datos.ajustes.campos.map((c) => h("option", { value: c, selected: c === d.campo }, c)));
  filaTipoCampo.appendChild(h("div", { class: "field" }, h("label", {}, "Campo"), selCampo));
  cuerpo.appendChild(filaTipoCampo);

  const refInp = h("input", { type: "text", value: d.referencia, placeholder: "N.° / referencia del documento" });
  const fechaInp = h("input", { type: "date", value: d.fecha });
  cuerpo.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" }, h("label", {}, "Referencia"), refInp),
    h("div", { class: "field" }, h("label", {}, "Fecha"), fechaInp)));

  const contraLabel = h("label", {}, esEntrante ? "Origen (remite)" : "Destino");
  const contraInp = h("input", { type: "text", value: d.contraparte, placeholder: esEntrante ? "¿Quién lo envía?" : "¿A quién va dirigido?" });
  selTipo.addEventListener("change", () => { contraLabel.textContent = selTipo.value === "entrante" ? "Origen (remite)" : "Destino"; });
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, contraLabel, contraInp)));

  const asuntoInp = h("input", { type: "text", value: d.asunto, placeholder: "Asunto del documento" });
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Asunto"), asuntoInp)));

  const plazoInp = h("input", { type: "date", value: d.plazo || "" });
  const selEstado = h("select", {}, ...ESTADOS.map((e) => h("option", { value: e.id, selected: e.id === d.estado }, e.txt)));
  cuerpo.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" }, h("label", {}, "Plazo (vencimiento)"), plazoInp),
    h("div", { class: "field" }, h("label", {}, "Estado"), selEstado)));

  const provInp = h("textarea", { rows: "2", placeholder: "Proveído / decreto / instrucción dada" }, d.proveido || "");
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Proveído"), provInp)));

  const obsInp = h("textarea", { rows: "2", placeholder: "Observaciones" }, d.observaciones || "");
  cuerpo.appendChild(h("div", { class: "form-row" }, h("div", { class: "field" }, h("label", {}, "Observaciones"), obsInp)));

  modal({
    titulo: d.referencia || d.asunto ? "Editar documento" : "Nuevo documento",
    cuerpo,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          const asunto = asuntoInp.value.trim();
          const ref = refInp.value.trim();
          if (!asunto && !ref) { toast("Indica al menos la referencia o el asunto", "err"); return false; }
          Object.assign(d, {
            tipo: selTipo.value, campo: selCampo.value, referencia: ref, fecha: fechaInp.value,
            contraparte: contraInp.value.trim(), asunto, plazo: plazoInp.value,
            estado: selEstado.value, proveido: provInp.value.trim(), observaciones: obsInp.value.trim(),
            actualizado: Date.now(),
          });
          const idx = datos.lista.findIndex((x) => x.id === d.id);
          if (idx >= 0) datos.lista[idx] = d; else datos.lista.push(d);
          persistir().then(() => { toast("Documento guardado", "ok"); render(); });
        },
      },
    ],
  });
}

async function eliminarDoc(d) {
  if (!await confirmar(`¿Eliminar el documento ${d.referencia ? `“${d.referencia}”` : "seleccionado"}?`, { titulo: "Eliminar documento", textoOk: "Eliminar", peligro: true })) return;
  datos.lista = datos.lista.filter((x) => x.id !== d.id);
  await persistir();
  toast("Documento eliminado", "");
  render();
}

/* ---------- Gestionar campos (P-1, P-2 … ampliables) ---------- */
function gestionarCampos() {
  const cuerpo = h("div", {});
  const lista = h("div", { class: "list" });
  function pintar() {
    limpiar(lista);
    datos.ajustes.campos.forEach((c, i) => {
      lista.appendChild(h("div", { class: "list-item", style: "padding:8px 12px" },
        h("span", { class: "list-item__title" }, c),
        h("div", { class: "list-item__actions" },
          h("button", {
            class: "btn btn--danger btn--sm", onclick: async () => {
              const enUso = datos.lista.some((d) => d.campo === c);
              if (enUso && !await confirmar(`El campo "${c}" tiene documentos asociados. ¿Quitarlo igualmente? (los documentos conservan la etiqueta)`, { titulo: "Quitar campo", textoOk: "Quitar", peligro: true })) return;
              datos.ajustes.campos.splice(i, 1); await persistir(); pintar();
            }
          }, "🗑️"))));
    });
  }
  pintar();
  const nuevo = h("input", { type: "text", placeholder: "Ej.: P-6, Comando, Inteligencia…", style: "flex:1" });
  const agregar = h("button", {
    class: "btn btn--primary", onclick: async () => {
      const v = nuevo.value.trim(); if (!v) return;
      if (datos.ajustes.campos.includes(v)) { toast("Ese campo ya existe", "err"); return; }
      datos.ajustes.campos.push(v); nuevo.value = ""; await persistir(); pintar();
    }
  }, "＋ Agregar");
  cuerpo.append(lista, h("div", { class: "form-row mt", style: "align-items:center" }, nuevo, agregar));

  modal({ titulo: "⚙️ Campos de la conducción", cuerpo, acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null, onClick: () => { render(); } }] });
}

/* ---------- Exportar a Word ---------- */
async function exportarWord() {
  const lista = docsFiltrados();
  if (!lista.length) { toast("No hay documentos para exportar", "err"); return; }
  const filas = lista.map((d) => {
    const est = estadoInfo(d);
    return `<tr>
      <td>${d.tipo === "entrante" ? "Entrante" : "Saliente"}</td>
      <td>${escapar(d.campo)}</td>
      <td>${escapar(d.referencia || "")}</td>
      <td>${d.fecha ? escapar(fechaCorta(d.fecha)) : ""}</td>
      <td>${escapar(d.contraparte || "")}</td>
      <td>${escapar(d.asunto || "")}</td>
      <td>${d.plazo ? escapar(fechaCorta(d.plazo)) : ""}</td>
      <td>${est.txt}</td>
      <td>${escapar(d.proveido || "")}</td>
    </tr>`;
  }).join("");

  const cuerpo = `
    <div class="encabezado"><h2>SEGUIMIENTO DE DOCUMENTACIÓN</h2>
    <div>Emitido: ${escapar(fechaLarga(fechaHoy()))}</div></div>
    <table>
      <thead><tr><th>Tipo</th><th>Campo</th><th>Referencia</th><th>Fecha</th><th>Origen/Destino</th><th>Asunto</th><th>Plazo</th><th>Estado</th><th>Proveído</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  const blob = blobWord("Seguimiento de Documentación", cuerpo);
  const nombre = `Documentacion_${fechaHoy()}.doc`;
  descargar(blob, nombre);
  try {
    if (ctx.store.estado().modo === "carpeta") {
      await ctx.store.guardarArchivo("Documentacion", nombre, blob);
      toast("Exportado y guardado en la carpeta “Documentacion”", "ok");
    } else { toast("Documento exportado", "ok"); }
  } catch { toast("Documento exportado (descarga)", ""); }
}
