/* app.js — Núcleo del Cuadro de Mando y Control del 2do Comandante. */
import * as store from "./storage.js";
import { h, limpiar, toast, modal, confirmar } from "./ui.js";
import { partesModulo } from "./modulos/partes.js";
import { documentacionModulo } from "./modulos/documentacion.js";
import { bibliotecaModulo } from "./modulos/biblioteca.js";
import { instructoresModulo } from "./modulos/instructores.js";
import { correctorModulo } from "./modulos/corrector.js";
import { radiogramaModulo } from "./modulos/radiograma.js";

// Registro de módulos del tablero.
const MODULOS = [
  {
    id: "partes", nombre: "Partes Diarios", icono: "📋", estado: "listo",
    desc: "Parte de personal de cuadros y de tropa. Exporta a Word y guarda el registro.",
    render: partesModulo,
  },
  {
    id: "documentacion", nombre: "Seguimiento de Documentación", icono: "🗂️", estado: "listo",
    desc: "Documentación entrante y saliente por campos (P-1…P-5). Estado, plazos y proveídos.",
    render: documentacionModulo,
  },
  {
    id: "biblioteca", nombre: "Biblioteca Virtual", icono: "📚", estado: "listo",
    desc: "Reglamentos y documentos clasificados según tu criterio, listos para consultar.",
    render: bibliotecaModulo,
  },
  {
    id: "instructores", nombre: "Libro de Vida de Instructores", icono: "🎖️", estado: "listo",
    desc: "Ficha, foto y documentos PDF sobre la situación particular de cada instructor.",
    render: instructoresModulo,
  },
  {
    id: "corrector", nombre: "Revisor de Documentación", icono: "✍️", estado: "listo",
    desc: "Revisa ortografía y formato según el Reglamento de Correspondencia Militar y formatos que cargues. Genera informe de correcciones.",
    render: correctorModulo,
  },
  {
    id: "radiograma", nombre: "Radiograma y Fotograma", icono: "📡", estado: "listo",
    desc: "Mensajes para WhatsApp, mosaico de fotos (fotograma) y exportación del radiograma a Word.",
    render: radiogramaModulo,
  },
];

const vista = document.getElementById("view");
const btnBack = document.getElementById("btnBack");
const pill = document.getElementById("storagePill");

const ctx = { store, h, limpiar, toast, modal, confirmar, irInicio, verModulo };

let moduloActual = null;

/* ---------------- Emblemas / Logos ---------------- */
let marcaUrls = { ejercito: null, eceme: null };

// Detecta un emblema estático (assets/icons/<k>.<ext>) probando varios formatos.
const EXT_EMBLEMA = ["jpg", "jpeg", "png", "webp", "svg"];
function cargarImagen(url) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(true);
    im.onerror = () => res(false);
    im.src = url;
  });
}
async function probarDefault(k) {
  const bust = Date.now();
  for (const ext of EXT_EMBLEMA) {
    const url = `assets/icons/${k}.${ext}`;
    if (await cargarImagen(`${url}?v=${bust}`)) return url;
  }
  return null;
}

async function cargarMarca() {
  try {
    const m = await store.leerJSON("marca", {});
    for (const k of ["ejercito", "eceme"]) {
      // 1) Emblema subido por el usuario (tiene prioridad)
      if (m && m[k]) { try { marcaUrls[k] = await store.urlArchivo(m[k]); } catch {} }
      // 2) Emblema estático incluido en assets/icons (ejercito.png / eceme.png)
      if (!marcaUrls[k]) { marcaUrls[k] = await probarDefault(k); }
    }
  } catch {}
  aplicarMarcaTopbar();
}

function aplicarMarcaTopbar() {
  const ej = document.getElementById("emblemaEjercito");
  const ec = document.getElementById("emblemaEceme");
  const fb = document.getElementById("brandFallback");
  if (marcaUrls.ejercito) { ej.src = marcaUrls.ejercito; ej.hidden = false; } else ej.hidden = true;
  if (marcaUrls.eceme) { ec.src = marcaUrls.eceme; ec.hidden = false; } else ec.hidden = true;
  if (fb) fb.hidden = !!(marcaUrls.ejercito || marcaUrls.eceme);
}

function emblemasHero() {
  if (!marcaUrls.ejercito && !marcaUrls.eceme) return null;
  const row = h("div", { class: "hero__emblemas" });
  if (marcaUrls.ejercito) row.appendChild(h("img", { src: marcaUrls.ejercito, alt: "Ejército de Bolivia" }));
  if (marcaUrls.eceme) row.appendChild(h("img", { src: marcaUrls.eceme, alt: "ECEME" }));
  return row;
}

async function subirEmblema(k, file, prevImg) {
  try {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const ruta = await store.guardarArchivo("Logos", `${k}.${ext}`, file);
    const m = await store.leerJSON("marca", {});
    m[k] = ruta; await store.guardarJSON("marca", m);
    const url = URL.createObjectURL(file);
    marcaUrls[k] = url;
    if (prevImg) prevImg.src = url;
    aplicarMarcaTopbar();
    toast("Emblema guardado", "ok");
  } catch (e) { console.error(e); toast("No se pudo guardar el emblema", "err"); }
}

/* ---------------- Navegación ---------------- */
function irInicio() {
  moduloActual = null;
  btnBack.hidden = true;
  location.hash = "";
  renderInicio();
}

function verModulo(id) {
  const m = MODULOS.find((x) => x.id === id);
  if (!m) return irInicio();
  moduloActual = id;
  btnBack.hidden = false;
  location.hash = id;
  limpiar(vista);
  try {
    m.render(vista, ctx);
  } catch (e) {
    console.error(e);
    vista.appendChild(h("div", { class: "construccion" },
      h("div", { class: "emoji" }, "⚠️"),
      h("h2", {}, "Error al abrir el módulo"),
      h("p", {}, String(e.message || e))));
  }
}

/* ---------------- Tablero de inicio ---------------- */
function renderInicio() {
  limpiar(vista);
  vista.appendChild(h("div", { class: "hero" },
    emblemasHero(),
    h("h1", {}, "Cuadro de Mando y Control"),
    h("p", {}, "Herramientas del 2do Comandante del Regimiento")));

  const grid = h("div", { class: "grid-modulos" });
  for (const m of MODULOS) {
    grid.appendChild(h("div", { class: "modulo-card", onclick: () => verModulo(m.id) },
      h("span", { class: `modulo-card__badge ${m.estado === "listo" ? "badge-listo" : "badge-pronto"}` },
        m.estado === "listo" ? "Disponible" : "Próximamente"),
      h("div", { class: "modulo-card__icon" }, m.icono),
      h("h3", { class: "modulo-card__title" }, m.nombre),
      h("p", { class: "modulo-card__desc" }, m.desc)));
  }
  vista.appendChild(grid);
}

/* ---------------- Píldora / estado de almacenamiento ---------------- */
function actualizarPill() {
  const e = store.estado();
  pill.classList.remove("ok", "local");
  const txt = pill.querySelector(".storage-pill__text");
  if (e.modo === "carpeta") { pill.classList.add("ok"); txt.textContent = e.nombre || "Carpeta"; }
  else if (e.modo === "local") { pill.classList.add("local"); txt.textContent = "Solo este equipo"; }
  else if (e.modo === "pendiente") { pill.classList.add("local"); txt.textContent = "Reautorizar carpeta"; }
  else { txt.textContent = "Sin carpeta"; }
}

/* ---------------- Configuración ---------------- */
async function abrirConfig() {
  const e = store.estado();
  const cuerpo = h("div", {});

  const info = h("div", {});
  function pintarInfo() {
    const est = store.estado();
    let texto = "";
    if (est.modo === "carpeta") texto = `<b>Modo:</b> Carpeta sincronizada<br><b>Carpeta:</b> ${est.nombre}<br><span class="muted small">Los datos se guardan aquí y OneDrive/Drive los sincroniza con tus otros equipos.</span>`;
    else if (est.modo === "local") texto = `<b>Modo:</b> Solo este equipo<br><span class="muted small">Los datos viven solo en este aparato. Usa Respaldo para pasarlos a otro.</span>`;
    else if (est.modo === "pendiente") texto = `<b>Carpeta:</b> ${est.nombre} <span class="tag tag--pend">Requiere reautorizar</span>`;
    else texto = `<b>Modo:</b> Sin configurar.`;
    limpiar(info).innerHTML = texto;
  }
  pintarInfo();

  const acciones = h("div", { class: "btn-row mt" });

  if (store.soportaCarpeta) {
    acciones.appendChild(h("button", { class: "btn btn--primary", onclick: async () => {
      try {
        await store.elegirCarpeta();
        actualizarPill(); pintarInfo();
        toast("Carpeta de datos configurada", "ok");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        toast("No se pudo configurar la carpeta", "err");
      }
    } }, "📁 Elegir carpeta (OneDrive)"));
  } else {
    cuerpo.appendChild(h("p", { class: "muted small" },
      "Este navegador no permite guardar en carpeta. Se usará almacenamiento local en este equipo. Recomendado: abrir con Microsoft Edge o Google Chrome en Windows."));
  }

  acciones.appendChild(h("button", { class: "btn btn--ghost", onclick: () => {
    store.usarLocal(); actualizarPill(); pintarInfo();
    toast("Usando almacenamiento local", "");
  } }, "💾 Usar solo este equipo"));

  // Respaldo
  const respaldoInfo = h("p", { class: "muted small", style: "margin:0 0 8px" },
    "Para pasar datos entre tu celular y tu laptop: exporta el respaldo aquí, envíatelo (WhatsApp, correo, o guárdalo en tu carpeta de OneDrive) y ábrelo con \"Importar respaldo\" en el otro aparato.");
  const respaldo = h("div", { class: "btn-row mt" },
    h("button", { class: "btn btn--gold btn--sm", onclick: async () => {
      const obj = await store.exportarRespaldo();
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `respaldo-cuadro-mando-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      toast("Respaldo exportado", "ok");
    } }, "⬇️ Exportar respaldo"),
    h("label", { class: "btn btn--ghost btn--sm", style: "cursor:pointer" }, "⬆️ Importar respaldo",
      h("input", { type: "file", accept: "application/json", style: "display:none", onchange: async (ev) => {
        const f = ev.target.files[0]; if (!f) return;
        try {
          await store.importarRespaldo(JSON.parse(await f.text()));
          toast("Respaldo importado. Recargando…", "ok");
          setTimeout(() => location.reload(), 900);
        }
        catch (err) { toast("Respaldo no válido", "err"); }
      } })));

  cuerpo.append(
    h("div", { class: "panel", style: "margin:0 0 14px;box-shadow:none" }, info),
    h("h3", { style: "margin:0 0 6px;font-size:14px;color:var(--verde-700)" }, "Almacenamiento"),
    acciones,
    h("h3", { style: "margin:16px 0 6px;font-size:14px;color:var(--verde-700)" }, "Respaldo manual"),
    respaldoInfo,
    respaldo,
  );

  // Emblemas / Logos
  const filaEmb = h("div", { class: "form-row" });
  for (const [k, label] of [["ejercito", "Ejército de Bolivia"], ["eceme", "ECEME"]]) {
    const prev = h("img", { alt: "", style: "height:64px;width:auto;object-fit:contain;background:var(--panel-2);border:1px solid var(--linea);border-radius:8px;padding:4px" });
    prev.src = marcaUrls[k] || "assets/icons/icon.svg";
    const inp = h("input", { type: "file", accept: "image/*", style: "display:none",
      onchange: (e) => { const f = e.target.files[0]; if (f) subirEmblema(k, f, prev); } });
    filaEmb.appendChild(h("div", { class: "field", style: "align-items:center;text-align:center" },
      h("label", {}, label), prev,
      h("label", { class: "btn btn--ghost btn--sm", style: "cursor:pointer;margin-top:6px" }, "📷 Subir / Cambiar", inp)));
  }
  cuerpo.append(
    h("h3", { style: "margin:16px 0 6px;font-size:14px;color:var(--verde-700)" }, "Emblemas / Logos"),
    filaEmb,
    h("p", { class: "muted small" }, "Aparecen en la barra superior y en la pantalla de inicio. Recomendado: imágenes PNG con fondo transparente."),
  );

  await modal({ titulo: "⚙️ Configuración", cuerpo, acciones: [{ texto: "Cerrar", clase: "btn--ghost", valor: null }] });
}

/* ---------------- Setup inicial ---------------- */
async function pantallaBienvenida() {
  limpiar(vista);
  const e = store.estado();
  const card = h("div", { class: "panel", style: "max-width:620px;margin:30px auto" });
  const emb = emblemasHero(); if (emb) card.appendChild(emb);
  card.appendChild(h("h2", { style: "color:var(--verde-800);margin-top:0" }, "Bienvenido, mi 2do Comandante"));
  card.appendChild(h("p", { class: "muted" },
    "Para que tus datos se guarden y se sincronicen entre tu tablet y tu laptop, elige una carpeta dentro de OneDrive donde la app guardará todo."));

  if (e.modo === "pendiente") {
    card.appendChild(h("p", {}, `Carpeta detectada: `, h("b", {}, e.nombre)));
    card.appendChild(h("button", { class: "btn btn--primary", onclick: async () => {
      await store.reautorizar(); actualizarPill();
      if (store.estado().modo === "carpeta") { toast("Carpeta reconectada", "ok"); irInicio(); }
    } }, "🔓 Reautorizar y continuar"));
  } else if (store.soportaCarpeta) {
    card.appendChild(h("div", { class: "btn-row" },
      h("button", { class: "btn btn--primary", onclick: async () => {
        try { await store.elegirCarpeta(); actualizarPill(); toast("Carpeta configurada", "ok"); irInicio(); }
        catch (err) { if (err?.name !== "AbortError") toast("No se pudo configurar", "err"); }
      } }, "📁 Elegir carpeta de datos"),
      h("button", { class: "btn btn--ghost", onclick: () => { store.usarLocal(); actualizarPill(); irInicio(); } },
        "Usar solo este equipo por ahora")));
  } else {
    card.appendChild(h("p", { class: "muted small" },
      "Sugerencia: abre esta app con Microsoft Edge o Google Chrome en Windows para poder sincronizar con OneDrive."));
    card.appendChild(h("button", { class: "btn btn--primary", onclick: () => { store.usarLocal(); actualizarPill(); irInicio(); } },
      "Continuar (solo este equipo)"));
  }
  vista.appendChild(card);
}

/* ---------------- Saludo por voz ---------------- */
// Los navegadores bloquean el audio automático hasta que el usuario interactúa
// con la página (clic, toque o tecla), así que el saludo se dispara con ese
// primer contacto — sigue sintiéndose automático, pero sí se llega a escuchar.
function saludoVoz() {
  try {
    if (!("speechSynthesis" in window)) return;
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    const texto = `${saludo}, Segundo Comandante`;
    let dicho = false;
    const disparar = () => {
      document.removeEventListener("click", disparar);
      document.removeEventListener("touchstart", disparar);
      document.removeEventListener("keydown", disparar);
      if (dicho) return;
      dicho = true;
      // En móvil (sobre todo iPhone) hay que llamar speak() dentro del mismo
      // toque, sin esperar nada async, o el navegador lo bloquea igual.
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "es-ES";
      const voces = speechSynthesis.getVoices();
      const esVoz = voces.find((v) => (v.lang || "").toLowerCase().startsWith("es"));
      if (esVoz) { u.voice = esVoz; u.lang = esVoz.lang; }
      speechSynthesis.speak(u);
    };
    document.addEventListener("click", disparar, { once: true });
    document.addEventListener("touchstart", disparar, { once: true });
    document.addEventListener("keydown", disparar, { once: true });
  } catch {}
}

/* ---------------- Arranque ---------------- */
async function arrancar() {
  // Se engancha antes que cualquier await para no perder el primer toque
  // del usuario, que puede llegar antes de que termine de cargar todo.
  saludoVoz();

  document.getElementById("btnSettings").addEventListener("click", abrirConfig);
  document.getElementById("btnBack").addEventListener("click", irInicio);
  document.getElementById("brandHome").addEventListener("click", irInicio);

  await store.inicializar();
  actualizarPill();
  await cargarMarca();

  const e = store.estado();
  if (e.modo === "ninguno" || e.modo === "pendiente") {
    await pantallaBienvenida();
  } else {
    const hash = location.hash.replace("#", "");
    if (hash && MODULOS.some((m) => m.id === hash)) verModulo(hash);
    else irInicio();
  }

  // Registrar service worker (PWA offline).
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

window.addEventListener("hashchange", () => {
  const hash = location.hash.replace("#", "");
  if (!hash) { if (moduloActual) irInicio(); }
  else if (hash !== moduloActual && MODULOS.some((m) => m.id === hash)) verModulo(hash);
});

arrancar();
