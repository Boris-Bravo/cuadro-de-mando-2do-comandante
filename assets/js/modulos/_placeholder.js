/* _placeholder.js — pantalla temporal para módulos en desarrollo. */
import { h } from "../ui.js";

export function placeholder(cont, { emoji, titulo, descripcion, fase }) {
  cont.appendChild(h("div", { class: "construccion" },
    h("div", { class: "emoji" }, emoji),
    h("h2", {}, titulo),
    h("p", {}, descripcion),
    fase ? h("p", { class: "muted" }, `Se desarrollará en la ${fase}.`) : null,
  ));
}
