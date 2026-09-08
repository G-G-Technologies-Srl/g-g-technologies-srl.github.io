// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Quattro righe di DOM che ogni schermata riscrive: un nodo, un pulsante, il contenuto di un
// contenitore, e l'elemento con quell'id.
//
// **Sono qui perché le usa un componente condiviso.** L'editor di `plan-editor.js` costruisce il suo
// disegno con queste quattro, e vive in due app: senza questo file ognuna avrebbe la sua copia — o,
// peggio, il componente importerebbe il modulo di un'app. Plan Scope le ri-esporta dal suo `ui.js`,
// così chi le chiamava continua a chiamarle da lì.
//
// Niente di più: `snack`, `ask`, le date e i numeri restano nell'app, perché parlano una lingua e
// una lingua è dell'app che la sceglie.

/** L'elemento con quell'id. Il nome corto è quello che si scrive cento volte in una schermata. */
export const el = (id) => document.getElementById(id);

export function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function button(className, text, onClick, { label = null } = {}) {
  const element = node("button", className, text);
  element.type = "button";
  if (label) element.setAttribute("aria-label", label);
  element.addEventListener("click", onClick);
  return element;
}

/** Il contenuto di un contenitore, sostituito in un colpo. */
export function fill(target, children) {
  target.replaceChildren(...children);
}
