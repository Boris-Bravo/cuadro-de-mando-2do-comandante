/*
 * contactos.js — Módulo "Agenda Telefónica de Contactos".
 *
 * Registro de teléfonos y correos, con opción de importar contactos desde
 * un archivo .vcf (vCard) exportado de un celular, Gmail, Outlook, etc.
 * 100% offline: el parseo del .vcf es texto plano, sin librerías externas.
 */
import { h, limpiar, toast, modal, confirmar, idNuevo } from "../ui.js";

const ARCHIVO = "contactos";

let ctx, cont, datos;
let fTexto = "";

export async function contactosModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || { lista: [] };
  if (!datos.lista) datos.lista = [];
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }

function nuevoContacto() { return { id: idNuevo(), nombre: "", telefono: "", telefono2: "", email: "", notas: "", creado: Date.now() }; }

function render() {
  limpiar(cont);
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {},
      h("h2", {}, "📇 Agenda Telefónica de Contactos"),
      h("div", { class: "sub" }, "Teléfonos y correos. Puedes importarlos desde un archivo .vcf")),
    h("div", { class: "btn-row" },
      h("label", { class: "btn btn--ghost", style: "cursor:pointer" }, "📥 Importar .vcf",
        h("input", { type: "file", accept: ".vcf,text/vcard", style: "display:none",
          onchange: (e) => { const f = e.target.files[0]; if (f) importarVCF(f); e.target.value = ""; } })),
      h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevoContacto(), true) }, "＋ Nuevo contacto"))));

  cont.appendChild(h("div", { class: "form-row" },
    h("div", { class: "field" },
      h("input", { type: "search", placeholder: "Buscar por nombre, teléfono o correo…", value: fTexto,
        oninput: (e) => { fTexto = e.target.value; repintar(); } }))));

  const wrap = h("div", { id: "contWrap" });
  cont.appendChild(wrap);
  repintar();
}

function filtrados() {
  const t = fTexto.trim().toLowerCase();
  return datos.lista
    .filter((c) => !t || [c.nombre, c.telefono, c.telefono2, c.email].some((x) => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

function repintar() {
  const wrap = document.getElementById("contWrap");
  if (!wrap) return;
  limpiar(wrap);
  const lista = filtrados();
  if (!lista.length) {
    wrap.appendChild(h("div", { class: "vacio" },
      h("div", { class: "big" }, "📇"),
      h("p", {}, datos.lista.length ? "No hay contactos que coincidan." : "Aún no hay contactos registrados."),
      h("p", { class: "muted" }, "Agrega el primero o impórtalos desde un archivo .vcf.")));
    return;
  }
  const l = h("div", { class: "list" });
  for (const c of lista) {
    l.appendChild(h("div", { class: "list-item" },
      h("div", { class: "list-item__main" },
        h("span", { class: "list-item__title" }, c.nombre || "Sin nombre"),
        h("span", { class: "list-item__meta" }, [c.telefono, c.email].filter(Boolean).join(" · ") || "Sin datos")),
      h("div", { class: "list-item__actions" },
        c.telefono ? h("a", { class: "btn btn--gold btn--sm", href: `tel:${c.telefono.replace(/\s+/g, "")}` }, "📞") : null,
        c.email ? h("a", { class: "btn btn--gold btn--sm", href: `mailto:${c.email}` }, "✉️") : null,
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => abrirEditor(structuredClone(c), false) }, "✏️"),
        h("button", { class: "btn btn--danger btn--sm", onclick: () => eliminarContacto(c) }, "🗑️"))));
  }
  wrap.appendChild(l);
}

function abrirEditor(c, esNueva) {
  const nombre = h("input", { type: "text", value: c.nombre || "" });
  const tel = h("input", { type: "tel", value: c.telefono || "" });
  const tel2 = h("input", { type: "tel", value: c.telefono2 || "" });
  const email = h("input", { type: "email", value: c.email || "" });
  const notas = h("textarea", { rows: "2", placeholder: "Cargo, unidad u otra referencia (opcional)" }, c.notas || "");

  const cuerpo = h("div", {},
    h("div", { class: "field", style: "margin-bottom:12px" }, h("label", {}, "Nombre"), nombre),
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Teléfono"), tel),
      h("div", { class: "field" }, h("label", {}, "Teléfono 2 (opcional)"), tel2)),
    h("div", { class: "field", style: "margin:12px 0" }, h("label", {}, "Correo (opcional)"), email),
    h("div", { class: "field" }, h("label", {}, "Notas"), notas));

  const acciones = [
    { texto: "Cancelar", clase: "btn--ghost", valor: null },
    {
      texto: "💾 Guardar", clase: "btn--primary", valor: "ok",
      onClick: () => {
        if (!nombre.value.trim()) { toast("Indica un nombre", "err"); return false; }
        Object.assign(c, { nombre: nombre.value.trim(), telefono: tel.value.trim(), telefono2: tel2.value.trim(), email: email.value.trim(), notas: notas.value.trim() });
        if (esNueva) datos.lista.push(c);
        else { const idx = datos.lista.findIndex((x) => x.id === c.id); if (idx >= 0) datos.lista[idx] = c; }
        persistir().then(() => { toast("Contacto guardado", "ok"); render(); });
      },
    },
  ];
  if (!esNueva) {
    acciones.splice(1, 0, { texto: "🗑️ Eliminar", clase: "btn--danger", valor: "del", onClick: () => eliminarContacto(c, true) });
  }
  modal({ titulo: esNueva ? "＋ Nuevo contacto" : "✏️ Editar contacto", cuerpo, acciones });
}

async function eliminarContacto(c, desdeEditor = false) {
  if (!desdeEditor && !await confirmar(`¿Eliminar a "${c.nombre || "este contacto"}"?`, { titulo: "Eliminar contacto", textoOk: "Eliminar", peligro: true })) return;
  datos.lista = datos.lista.filter((x) => x.id !== c.id);
  await persistir();
  toast("Contacto eliminado", "");
  render();
}

/* =================== IMPORTAR .VCF (vCard) =================== */
function parseVCard(texto) {
  // Une líneas "plegadas" (las que empiezan con espacio/tab son continuación de la anterior).
  const lineas = texto.split(/\r\n|\r|\n/);
  const unidas = [];
  for (const l of lineas) {
    if (/^[ \t]/.test(l) && unidas.length) unidas[unidas.length - 1] += l.slice(1);
    else unidas.push(l);
  }
  const contactos = [];
  let actual = null;
  for (const linea of unidas) {
    if (/^BEGIN:VCARD/i.test(linea)) { actual = { nombre: "", telefono: "", telefono2: "", email: "" }; continue; }
    if (/^END:VCARD/i.test(linea)) { if (actual && (actual.nombre || actual.telefono || actual.email)) contactos.push(actual); actual = null; continue; }
    if (!actual) continue;
    const idx = linea.indexOf(":");
    if (idx < 0) continue;
    const clave = linea.slice(0, idx);
    const valor = linea.slice(idx + 1).trim();
    if (!valor) continue;
    const claveBase = clave.split(";")[0].toUpperCase();
    if (claveBase === "FN" && !actual.nombre) actual.nombre = valor;
    else if (claveBase === "N" && !actual.nombre) actual.nombre = valor.split(";").filter(Boolean).reverse().join(" ").trim();
    else if (claveBase === "TEL") { if (!actual.telefono) actual.telefono = valor; else if (!actual.telefono2) actual.telefono2 = valor; }
    else if (claveBase === "EMAIL" && !actual.email) actual.email = valor;
  }
  return contactos;
}

async function importarVCF(file) {
  try {
    const texto = await file.text();
    const encontrados = parseVCard(texto);
    if (!encontrados.length) { toast("No se encontraron contactos en el archivo", "err"); return; }
    const existentes = new Set(datos.lista.map((c) => `${(c.nombre || "").toLowerCase()}|${(c.telefono || "").replace(/\s+/g, "")}`));
    let nuevos = 0;
    for (const c of encontrados) {
      const clave = `${(c.nombre || "").toLowerCase()}|${(c.telefono || "").replace(/\s+/g, "")}`;
      if (existentes.has(clave)) continue;
      datos.lista.push({ id: idNuevo(), nombre: c.nombre, telefono: c.telefono, telefono2: c.telefono2, email: c.email, notas: "", creado: Date.now() });
      existentes.add(clave);
      nuevos++;
    }
    await persistir();
    const omitidos = encontrados.length - nuevos;
    toast(`${nuevos} contacto(s) importado(s)${omitidos ? ` · ${omitidos} ya existían` : ""}`, "ok");
    render();
  } catch (e) {
    console.error(e);
    toast("No se pudo leer el archivo. Verifica que sea un .vcf válido", "err");
  }
}
