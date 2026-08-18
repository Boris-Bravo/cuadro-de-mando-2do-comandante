/* ui.js — utilidades de interfaz compartidas por todos los módulos. */

// Crea un elemento con atributos e hijos. h("div", {class:"x"}, "texto", hijoEl)
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of hijos.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function limpiar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Notificación temporal.
export function toast(msg, tipo = "") {
  const cont = document.getElementById("toasts");
  const t = h("div", { class: `toast ${tipo}` }, msg);
  cont.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2800);
  setTimeout(() => t.remove(), 3200);
}

// Ventana modal. Devuelve una promesa que se resuelve con el valor de cerrar(valor).
export function modal({ titulo, cuerpo, acciones }) {
  return new Promise((resolve) => {
    const back = h("div", { class: "modal-back" });
    let cerrado = false;
    const cerrar = (val) => { if (cerrado) return; cerrado = true; back.remove(); resolve(val); };

    const foot = h("div", { class: "modal__foot" });
    (acciones || [{ texto: "Cerrar", clase: "btn--ghost", valor: null }]).forEach((a) => {
      foot.appendChild(h("button", {
        class: `btn ${a.clase || "btn--ghost"}`,
        onclick: () => { if (a.onClick) { const r = a.onClick(); if (r === false) return; } cerrar(a.valor); }
      }, a.texto));
    });

    const box = h("div", { class: "modal" },
      h("div", { class: "modal__head" },
        h("h3", {}, titulo || ""),
        h("button", { class: "iconbtn", style: "background:#eee;color:#333;border:none", onclick: () => cerrar(null) }, "✕")
      ),
      typeof cuerpo === "string" ? h("div", { class: "modal__body", html: cuerpo }) : h("div", { class: "modal__body" }, cuerpo),
      foot
    );
    back.appendChild(box);
    back.addEventListener("click", (e) => { if (e.target === back) cerrar(null); });
    document.body.appendChild(back);
  });
}

// Confirmación simple.
export async function confirmar(mensaje, { titulo = "Confirmar", textoOk = "Aceptar", peligro = false } = {}) {
  const r = await modal({
    titulo,
    cuerpo: `<p style="margin:0;line-height:1.5">${mensaje}</p>`,
    acciones: [
      { texto: "Cancelar", clase: "btn--ghost", valor: false },
      { texto: textoOk, clase: peligro ? "btn--danger" : "btn--primary", valor: true },
    ],
  });
  return r === true;
}

export function fechaHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fechaLarga(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${d} de ${meses[m - 1]} de ${a}`;
}

export function idNuevo() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
