// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Un DOM finto, quel tanto che basta a far girare una schermata sotto Node.
//
// **Serve perché una schermata è il pezzo che nessun altro test toccava.** I moduli sotto — conti,
// tracciato, modello, diario — hanno le loro prove e girano senza browser; quello che restava fuori
// era il codice che disegna, cioè quello in cui si sbagliano gli id, si dimentica un `hidden` e si
// arma un comando che poi non fa niente. Difetti che non danno nessun errore fino al momento in cui
// qualcuno apre la pagina — e che, dopo un rilascio, li apre sul suo schermo e non sul nostro.
//
// **Gli id li prende da `run/index.html`, non da un elenco scritto qui.** `getElementById` di un id
// che nel markup non c'è **solleva**, invece di rispondere `null` come farebbe il browser: un `null`
// diventerebbe «non è un oggetto» venti righe più in là, con un messaggio che non nomina nessun id.
// I campi di un modulo arrivano dallo stesso posto, quindi un `name` sbagliato si comporta come nel
// browser — cioè male, e qui subito.
//
// Non è un browser e non prova a esserlo: niente layout, niente CSS, niente eventi che risalgono
// l'albero. Quello che riproduce è la parte su cui il codice di una schermata fa affidamento —
// leggere e scrivere `textContent`, `hidden` e `value`, appendere righe, chiamare un ascoltatore —
// e per il resto tace, così una prova che passa qui non promette più di quello che ha verificato.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Gli id dichiarati nel markup, e i campi di ogni `<form>`, dal file vero. */
function _fromHtml(html) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const forms = new Map();
  for (const match of html.matchAll(/<form[^>]*\sid="([^"]+)"([\s\S]*?)<\/form>/g)) {
    forms.set(match[1], [...match[2].matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]));
  }
  return { ids, forms };
}

function _classList(node) {
  const set = new Set();
  return {
    add: (name) => set.add(name),
    remove: (name) => set.delete(name),
    contains: (name) => set.has(name),
    toggle: (name, on) => (on === undefined ? (set.has(name) ? set.delete(name) : set.add(name))
      : on ? set.add(name) : set.delete(name)),
    get size() { return set.size; },
    // Per le asserzioni: la classe scritta a mano su `className` conta come le altre.
    has: (name) => set.has(name) || String(node.className).split(/\s+/).includes(name),
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Metti in piedi `document`, `window` e `location` sopra il markup dato.
 *
 * Torna qualche attrezzo per le prove: `byId`, `text` e `rows`, più `reset` per rifare tutto da
 * capo fra due scenari.
 */
export function install(html) {
  const { ids, forms } = _fromHtml(html);
  const nodes = new Map();

  const make = (tag, id = null) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      id,
      children: [],
      parent: null,
      className: "",
      hidden: false,
      value: "",
      title: "",
      type: "",
      href: "",
      rows: 2,
      tabIndex: -1,
      maxLength: 0,
      open: false,
      returnValue: "",
      attrs: {},
      listeners: {},

      // `textContent = ""` è come si svuota una tabella in tutta l'app: qui deve portarsi via
      // anche le righe, o un secondo disegno le troverebbe tutte lì e ne aggiungerebbe altre.
      get textContent() {
        if (this._text !== undefined) return this._text;
        return this.children.map((kid) => kid.textContent).join("");
      },
      set textContent(value) {
        this._text = String(value);
        this.children = [];
      },

      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] === undefined ? null : this.attrs[name]; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
      append(...kids) {
        for (const kid of kids) {
          this._text = undefined;
          kid.parent = this;
          this.children.push(kid);
        }
      },
      focus() { document.activeElement = this; },
      // `select()` lo chiama chi apre una domanda con un testo già dentro, perché scrivere
      // sostituisca invece di accodarsi. Qui non c'è niente da selezionare: basta che esista.
      select() {},
      blur() { if (document.activeElement === this) document.activeElement = null; },
      reset() { for (const field of Object.values(this.elements || {})) field.value = ""; },
      showModal() { this.open = true; },
      close() { this.open = false; },
      querySelector() { return null; },
      querySelectorAll() { return []; },

      /** Chiama gli ascoltatori di un evento, e torna la promessa di quello che hanno fatto. */
      fire(name, extra = {}) {
        const event = {
          preventDefault() {}, stopPropagation() {}, target: this, key: "", ...extra,
        };
        return Promise.all((this.listeners[name] || []).map((fn) => fn(event)));
      },

      /** Le righe di una tabella, o le voci di un elenco: quello che le prove guardano. */
      get rowCount() { return this.children.length; },

      /** Il testo di questo nodo e di tutto quello che sta sotto, per un `assert.match`. */
      get allText() {
        return this._text !== undefined && !this.children.length
          ? this._text
          : this.children.map((kid) => kid.allText).join(" ");
      },

      /** La cella numero `n` di una riga, o la voce numero `n` di un elenco. */
      at(n) { return this.children[n]; },
    };
    node.classList = _classList(node);
    if (forms.has(id)) {
      node.elements = {};
      for (const name of forms.get(id)) node.elements[name] = make("input");
    }
    return node;
  };

  const document = {
    activeElement: null,
    documentElement: make("html"),
    getElementById(id) {
      if (!ids.has(id)) {
        throw new Error(`getElementById("${id}"): questo id non esiste in run/index.html`);
      }
      if (!nodes.has(id)) nodes.set(id, make("div", id));
      return nodes.get(id);
    },
    createElement(tag) { return make(tag); },
    contains() { return true; },
    querySelectorAll() { return []; },
    addEventListener() {},
    get visibilityState() { return "visible"; },
  };

  globalThis.document = document;
  globalThis.window = {
    listeners: {},
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    matchMedia: () => ({ matches: false }),
  };
  // `location` in Node non esiste: si definisce, e l'hash è scrivibile perché è così che l'app
  // naviga — una riga cliccata scrive `location.hash` e non chiama nessuna funzione.
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { hash: "", search: "" },
  });

  return {
    byId: (id) => document.getElementById(id),
    text: (id) => document.getElementById(id).allText,
    /** Quante righe ha una tabella o un elenco. */
    count: (id) => document.getElementById(id).children.length,

    /**
     * Fra due scenari: il puntatore e l'indirizzo, e **non** i nodi.
     *
     * I nodi restano gli stessi apposta, perché è così che sta una pagina: si carica una volta, i
     * moduli si tengono i riferimenti e armano i comandi una volta sola. Buttandoli via, il dialogo
     * delle domande di `ask.js` continuerebbe a puntare al nodo di prima — che è esattamente il
     * difetto trovato scrivendo queste prove: la conferma non arrivava mai e il test restava
     * appeso. Ogni disegno riempie da capo quello che tocca, quindi non c'è niente da svuotare.
     */
    reset() { document.activeElement = null; location.hash = ""; },
  };
}
