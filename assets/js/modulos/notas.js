/*
 * notas.js — Módulo "Bloc de Notas".
 *
 * Apuntes libres, organizados por fecha. Cada nota puede tener texto y/o
 * un dibujo a mano (dedo o lápiz óptico, pensado para tablet cuando no hay
 * tiempo de escribir). El dibujo se guarda como imagen PNG en la subcarpeta
 * "Notas/<id>" de la carpeta de datos, igual que fotos/documentos de otros
 * módulos — no se embebe en el JSON para no inflarlo.
 */
import { h, limpiar, toast, confirmar, fechaHoy, fechaLarga, idNuevo } from "../ui.js";

const ARCHIVO = "notas";
const COLORES = ["#1a1a1a", "#1660d8", "#d81616", "#1a8a4a"];
const GROSORES = [2, 4, 8];

let ctx, cont, datos;
let vista = { modo: "lista", id: null };
let fTexto = "";

export async function notasModulo(contenedor, contexto) {
  ctx = contexto; cont = contenedor;
  datos = await ctx.store.leerJSON(ARCHIVO, null) || { lista: [] };
  if (!datos.lista) datos.lista = [];
  vista = { modo: "lista", id: null };
  render();
}

async function persistir() { await ctx.store.guardarJSON(ARCHIVO, datos); }
function nuevaNota() { return { id: idNuevo(), fecha: fechaHoy(), titulo: "", contenido: "", dibujoRuta: "", creado: Date.now(), actualizado: Date.now() }; }

function render() {
  limpiar(cont);
  if (vista.modo === "editor") renderEditor(vista.id);
  else renderLista();
}

/* =================== LISTA =================== */
function renderLista() {
  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, "📝 Bloc de Notas"), h("div", { class: "sub" }, "Escribe o dibuja a mano — tus apuntes, organizados por fecha")),
    h("button", { class: "btn btn--primary", onclick: () => { vista = { modo: "editor", id: null }; render(); } }, "＋ Nueva nota")));

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

async function pintarMiniatura(imgEl, ruta) {
  try { const url = await ctx.store.urlArchivo(ruta); if (url) imgEl.src = url; } catch {}
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
      h("p", { class: "muted" }, "Escribe o dibuja la primera con “Nueva nota”.")));
    return;
  }
  let fechaActual = null;
  for (const n of lista) {
    if (n.fecha !== fechaActual) {
      fechaActual = n.fecha;
      wrap.appendChild(h("h3", { style: "margin:18px 0 8px;color:var(--verde-800)" }, n.fecha ? fechaLarga(n.fecha) : "Sin fecha"));
    }
    const fila = h("div", { class: "list-item", style: "cursor:pointer;align-items:center", onclick: () => { vista = { modo: "editor", id: n.id }; render(); } });
    if (n.dibujoRuta) {
      const mini = h("img", { alt: "", style: "width:48px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--linea);background:#fff;flex:none" });
      pintarMiniatura(mini, n.dibujoRuta);
      fila.appendChild(mini);
    }
    fila.appendChild(h("div", { class: "list-item__main" },
      h("span", { class: "list-item__title" }, n.titulo || "Sin título", n.dibujoRuta ? " 🎨" : ""),
      h("span", { class: "list-item__meta" }, (n.contenido || "").slice(0, 140) || (n.dibujoRuta ? "Nota dibujada" : "Sin contenido"))));
    wrap.appendChild(fila);
  }
}

/* =================== EDITOR (texto + dibujo) =================== */
function renderEditor(id) {
  const original = id ? datos.lista.find((x) => x.id === id) : null;
  const esNueva = !original;
  const nota = original ? structuredClone(original) : nuevaNota();

  const fecha = h("input", { type: "date", value: nota.fecha || fechaHoy() });
  const titulo = h("input", { type: "text", value: nota.titulo || "", placeholder: "Título de la nota" });
  const textoArea = h("textarea", { rows: "10", placeholder: "Escribe aquí tus apuntes…" }, nota.contenido || "");

  const seccionTexto = h("div", { id: "seccionTexto" }, textoArea);
  const canvas = h("canvas", { class: "draw-canvas" });
  const toolbar = h("div", { class: "btn-row", style: "margin-bottom:10px;flex-wrap:wrap;align-items:center;gap:10px" });
  const seccionDibujo = h("div", { id: "seccionDibujo", style: "display:none" }, toolbar, canvas);

  const tabTexto = h("span", { class: "chip active" }, "✍️ Texto");
  const tabDibujo = h("span", { class: "chip" }, "🎨 Dibujo");
  tabTexto.addEventListener("click", () => {
    tabTexto.classList.add("active"); tabDibujo.classList.remove("active");
    seccionTexto.style.display = ""; seccionDibujo.style.display = "none";
  });
  tabDibujo.addEventListener("click", () => {
    tabDibujo.classList.add("active"); tabTexto.classList.remove("active");
    seccionDibujo.style.display = ""; seccionTexto.style.display = "none";
    // El lienzo se mide/prepara recién aquí: mientras la sección estaba oculta
    // (display:none), su ancho y alto eran 0 y no se podía dimensionar bien.
    estadoDibujo.iniciar();
  });

  const guardar = async () => {
    try {
      if (estadoDibujo.modificado) {
        if (canvasEnBlanco(canvas)) {
          if (nota.dibujoRuta) { try { await ctx.store.borrarArchivo(nota.dibujoRuta); } catch {} }
          nota.dibujoRuta = "";
        } else {
          const blob = await canvasABlob(canvas);
          nota.dibujoRuta = await ctx.store.guardarArchivo(`Notas/${nota.id}`, "dibujo.png", blob);
        }
      }
      nota.fecha = fecha.value || fechaHoy();
      nota.titulo = titulo.value.trim();
      nota.contenido = textoArea.value.trim();
      nota.actualizado = Date.now();
      if (!nota.titulo && !nota.contenido && !nota.dibujoRuta) { toast("La nota está vacía", "err"); return; }
      if (esNueva) datos.lista.push(nota);
      else { const idx = datos.lista.findIndex((x) => x.id === nota.id); if (idx >= 0) datos.lista[idx] = nota; }
      await persistir();
      toast("Nota guardada", "ok");
      vista = { modo: "lista" };
      render();
    } catch (e) { console.error(e); toast("No se pudo guardar la nota", "err"); }
  };

  const eliminar = async () => {
    if (!await confirmar(`¿Eliminar la nota "${nota.titulo || "sin título"}"?`, { titulo: "Eliminar nota", textoOk: "Eliminar", peligro: true })) return;
    if (nota.dibujoRuta) { try { await ctx.store.borrarArchivo(nota.dibujoRuta); } catch {} }
    datos.lista = datos.lista.filter((x) => x.id !== nota.id);
    await persistir();
    toast("Nota eliminada", "");
    vista = { modo: "lista" };
    render();
  };

  cont.appendChild(h("div", { class: "page-head" },
    h("div", {}, h("h2", {}, esNueva ? "📝 Nueva nota" : "✏️ Editar nota")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn--ghost", onclick: () => { vista = { modo: "lista" }; render(); } }, "← Volver"),
      !esNueva ? h("button", { class: "btn btn--danger", onclick: eliminar }, "🗑️ Eliminar") : null,
      h("button", { class: "btn btn--primary", onclick: guardar }, "💾 Guardar"))));

  cont.appendChild(h("div", { class: "panel" },
    h("div", { class: "form-row" },
      h("div", { class: "field" }, h("label", {}, "Fecha"), fecha),
      h("div", { class: "field" }, h("label", {}, "Título"), titulo)),
    h("div", { class: "chips", style: "margin:14px 0" }, tabTexto, tabDibujo),
    seccionTexto,
    seccionDibujo));

  const estadoDibujo = configurarCanvas(canvas, toolbar);
  cargarDibujoExistente(nota, estadoDibujo, canvas);
}

/* =================== LIENZO DE DIBUJO =================== */
function configurarCanvas(canvas, toolbar) {
  const estado = { color: COLORES[0], grosor: GROSORES[1], pila: [], modificado: false, cx: null, dibujando: false };

  // Colores
  const swatches = COLORES.map((col) => {
    const sw = h("span", { class: `draw-swatch ${col === estado.color ? "draw-swatch--activo" : ""}`, style: `background:${col}` });
    sw.addEventListener("click", () => {
      estado.color = col;
      swatches.forEach((s) => s.classList.remove("draw-swatch--activo"));
      sw.classList.add("draw-swatch--activo");
    });
    return sw;
  });
  // Grosores
  const tamPx = { [GROSORES[0]]: 8, [GROSORES[1]]: 13, [GROSORES[2]]: 20 };
  const sizes = GROSORES.map((g) => {
    const px = tamPx[g];
    const sz = h("span", { class: `draw-size ${g === estado.grosor ? "draw-size--activo" : ""}`, style: `width:${px}px;height:${px}px` });
    sz.addEventListener("click", () => {
      estado.grosor = g;
      sizes.forEach((s) => s.classList.remove("draw-size--activo"));
      sz.classList.add("draw-size--activo");
    });
    return sz;
  });
  const btnDeshacer = h("button", { class: "btn btn--ghost btn--sm" }, "↩️ Deshacer");
  const btnBorrar = h("button", { class: "btn btn--ghost btn--sm" }, "🧹 Borrar todo");
  toolbar.append(...swatches, h("span", { style: "width:10px" }), ...sizes, h("span", { style: "flex:1" }), btnDeshacer, btnBorrar);

  // Tamaño real del lienzo (nítido en pantallas de alta densidad, ej. tablets).
  // Se llama recién cuando la sección de dibujo se muestra por primera vez:
  // mientras está oculta (display:none) su ancho/alto miden 0.
  estado.iniciar = () => {
    if (estado.cx) return; // ya inicializado
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300, cssH = canvas.clientHeight || 320;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const cx = canvas.getContext("2d", { willReadFrequently: true });
    cx.scale(dpr, dpr);
    cx.lineCap = "round";
    cx.lineJoin = "round";
    cx.fillStyle = "#ffffff";
    cx.fillRect(0, 0, cssW, cssH);
    estado.cx = cx;

    const posDe = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener("pointerdown", (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      guardarUndo(estado, canvas);
      estado.dibujando = true;
      estado.modificado = true;
      const [x, y] = posDe(e);
      cx.strokeStyle = estado.color;
      cx.lineWidth = estado.grosor;
      cx.beginPath();
      cx.moveTo(x, y);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!estado.dibujando) return;
      const [x, y] = posDe(e);
      cx.lineTo(x, y);
      cx.stroke();
      e.preventDefault();
    });
    const terminar = () => { estado.dibujando = false; };
    canvas.addEventListener("pointerup", terminar);
    canvas.addEventListener("pointercancel", terminar);
    canvas.addEventListener("pointerleave", terminar);

    if (estado.pendienteCargar) { estado.pendienteCargar(); estado.pendienteCargar = null; }
  };

  btnDeshacer.addEventListener("click", () => {
    if (!estado.cx || !estado.pila.length) return;
    estado.cx.putImageData(estado.pila.pop(), 0, 0);
    estado.modificado = true;
  });
  btnBorrar.addEventListener("click", () => {
    if (!estado.cx) return;
    guardarUndo(estado, canvas);
    estado.cx.fillStyle = "#ffffff";
    estado.cx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    estado.modificado = true;
  });

  return estado;
}

function guardarUndo(estado, canvas) {
  if (!estado.cx) return;
  estado.pila.push(estado.cx.getImageData(0, 0, canvas.width, canvas.height));
  if (estado.pila.length > 25) estado.pila.shift();
}

function canvasEnBlanco(canvas) {
  const cx = canvas.getContext("2d");
  const { data } = cx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return false;
  }
  return true;
}

function canvasABlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

async function cargarDibujoExistente(nota, estado, canvas) {
  if (!nota.dibujoRuta) return;
  try {
    const blob = await ctx.store.leerArchivo(nota.dibujoRuta);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const dibujar = () => { estado.cx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight); URL.revokeObjectURL(url); };
    // El lienzo recién se inicializa cuando el usuario abre la pestaña "Dibujo"
    // (ver estado.iniciar en configurarCanvas); si aún no está listo, se
    // deja pendiente y se dibuja apenas se inicialice.
    if (estado.cx) dibujar();
    else estado.pendienteCargar = dibujar;
  } catch (e) { console.error(e); }
}
