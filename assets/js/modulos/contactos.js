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
      h("div", { class: "sub" }, "Teléfonos y correos. Impórtalos o compártelos por WhatsApp o correo")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--primary", onclick: () => abrirEditor(nuevoContacto(), true) }, "＋ Nuevo contacto"))));

  cont.appendChild(h("div", { class: "btn-row", style: "margin-bottom:14px;flex-wrap:wrap" },
    h("label", { class: "btn btn--ghost btn--sm", style: "cursor:pointer" }, "📥 Importar .vcf",
      h("input", { type: "file", accept: ".vcf,text/vcard", style: "display:none",
        onchange: (e) => { const f = e.target.files[0]; if (f) importarVCF(f); e.target.value = ""; } })),
    h("button", { class: "btn btn--ghost btn--sm", onclick: importarDesdeTexto }, "💬 Importar texto de WhatsApp"),
    h("button", { class: "btn btn--gold btn--sm", onclick: () => exportarLista("whatsapp") }, "📤 Exportar por WhatsApp"),
    h("button", { class: "btn btn--gold btn--sm", onclick: () => exportarLista("correo") }, "📤 Exportar por correo")));

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
        h("button", { class: "btn btn--ghost btn--sm", title: "Compartir este contacto por WhatsApp", onclick: () => compartirWhatsApp(textoContacto(c)) }, "💬"),
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

/* =================== COMPARTIR / EXPORTAR =================== */
function textoContacto(c) {
  const lineas = [`👤 ${c.nombre || "Sin nombre"}`];
  if (c.telefono) lineas.push(`📞 ${c.telefono}`);
  if (c.telefono2) lineas.push(`📞 ${c.telefono2}`);
  if (c.email) lineas.push(`✉️ ${c.email}`);
  if (c.notas) lineas.push(c.notas);
  return lineas.join("\n");
}

function compartirWhatsApp(texto) {
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, "_blank");
}

function exportarLista(via) {
  const lista = filtrados();
  if (!lista.length) { toast("No hay contactos para exportar", "err"); return; }
  if (lista.length > 60) toast("Son muchos contactos: el mensaje puede salir recortado. Para pasar todos usa \"Exportar respaldo\" en Configuración.", "");
  const texto = lista.map(textoContacto).join("\n\n");
  if (via === "whatsapp") compartirWhatsApp(texto);
  else window.open(`mailto:?subject=${encodeURIComponent("Agenda de contactos")}&body=${encodeURIComponent(texto)}`, "_blank");
}

/* =================== IMPORTAR: agregar sin duplicar =================== */
async function agregarContactosNuevos(encontrados) {
  const existentes = new Set(datos.lista.map((c) => `${(c.nombre || "").toLowerCase()}|${(c.telefono || "").replace(/\s+/g, "")}`));
  let nuevos = 0;
  for (const c of encontrados) {
    const clave = `${(c.nombre || "").toLowerCase()}|${(c.telefono || "").replace(/\s+/g, "")}`;
    if (existentes.has(clave)) continue;
    datos.lista.push({ id: idNuevo(), nombre: c.nombre || "", telefono: c.telefono || "", telefono2: c.telefono2 || "", email: c.email || "", notas: "", creado: Date.now() });
    existentes.add(clave);
    nuevos++;
  }
  await persistir();
  const omitidos = encontrados.length - nuevos;
  toast(`${nuevos} contacto(s) importado(s)${omitidos ? ` · ${omitidos} ya existían` : ""}`, nuevos ? "ok" : "");
  render();
}

/* =================== IMPORTAR: pegar texto (ej. compartido por WhatsApp) =================== */
function parseTextoContactos(texto) {
  const bloques = texto.split(/\n\s*\n/);
  const contactos = [];
  for (const bloque of bloques) {
    const lineas = bloque.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lineas.length) continue;
    let nombre = "", telefono = "", telefono2 = "", email = "";
    for (const linea of lineas) {
      const emailMatch = linea.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (emailMatch && !email) { email = emailMatch[0]; continue; }
      const soloDigitos = linea.replace(/\D/g, "");
      if (soloDigitos.length >= 6) {
        const limpio = linea.replace(/^[^\d+]*/, "").trim();
        if (!telefono) telefono = limpio; else if (!telefono2) telefono2 = limpio;
        continue;
      }
      if (!nombre) nombre = linea.replace(/^👤\s*/, "").trim();
    }
    if (nombre || telefono || email) contactos.push({ nombre, telefono, telefono2, email });
  }
  return contactos;
}

function importarDesdeTexto() {
  const area = h("textarea", { rows: "10", placeholder: "Pega aquí el texto de WhatsApp (uno o varios contactos, separados por una línea en blanco)…" });
  modal({
    titulo: "💬 Importar texto de WhatsApp",
    cuerpo: h("div", {},
      h("p", { class: "muted small", style: "margin-top:0" },
        "Útil cuando te comparten un contacto como mensaje de texto (no como archivo adjunto). Si te llega como archivo .vcf, mejor usa \"Importar .vcf\"."),
      h("div", { class: "field" }, h("label", {}, "Texto"), area)),
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: null },
      {
        texto: "📥 Importar", clase: "btn--primary", valor: "ok",
        onClick: () => {
          const encontrados = parseTextoContactos(area.value);
          if (!encontrados.length) { toast("No se reconoció ningún contacto en el texto", "err"); return false; }
          agregarContactosNuevos(encontrados);
        },
      },
    ],
  });
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
    await agregarContactosNuevos(encontrados);
  } catch (e) {
    console.error(e);
    toast("No se pudo leer el archivo. Verifica que sea un .vcf válido", "err");
  }
}
