// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Quanto è al sicuro quello che c'è qui dentro, e cosa dirne a chi apre la Situazione.
//
// **Senza server la copia è una, e questa è l'app in cui perderla costa di più.** Un registro
// fatture perso non si riscrive a memoria: i numeri sono usciti, i file sono partiti, e quello che
// resta è ricostruire un anno dalle copie di cortesia dei clienti. Quindi la domanda «questo
// archivio è al sicuro?» ha una risposta sola, e va detta dove si guarda ogni giorno.
//
// **Non basta chiedersi se una cartella è collegata.** Una cartella collegata può non ricevere
// niente: aspetta il permesso che il browser ha lasciato scadere, è trattenuta perché teneva già
// altre copie e nessuno ha ancora detto quale versione vale, o l'ultima scrittura è fallita. Tutti
// e tre gli stati sembrano «collegata» a chi ha collegato, e nessuno dei tre scrive.
//
// E dove la cartella non esiste — Firefox, Safari, qualunque telefono — l'unica copia è quella che
// esporta una persona, quindi il promemoria deve **tornare**: non basta averlo fatto una volta,
// vale finché il lavoro fatto dopo non è stato messo al sicuro.
//
// Nessun DOM, nessun deposito: fatti dentro, una chiave e i suoi valori fuori. Le frasi stanno in
// `i18n.js` nelle due lingue, come tutte le altre.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/safety.mjs

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Sotto questo numero di documenti non si avvisa: chi ne ha uno sta ancora guardando cos'è l'app. */
export const SOGLIA_DOCUMENTI = 3;

/** Un archivio esportato a mano invecchia: dopo un mese il promemoria torna comunque. */
export const GIORNI_ARCHIVIO = 30;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** I giorni fra due istanti ISO. `null` quando uno dei due manca. */
function _giorni(da, a) {
  if (!da || !a) return null;
  const uno = Date.parse(da);
  const altro = Date.parse(a);
  if (Number.isNaN(uno) || Number.isNaN(altro)) return null;
  return Math.floor((altro - uno) / 86400000);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Cosa dire della sicurezza dell'archivio, o `null` quando non c'è niente da dire.
 *
 * `stato` è quello di `biz/folder.js` — `unavailable`, `none`, `prompt`, `held`, `linked`, con
 * `folder`, `lastWrite` ed `error`. `ultimoArchivio` è quando è stato esportato un file a mano,
 * `ultimoMovimento` quando i documenti sono cambiati l'ultima volta, `documenti` quanti ce ne sono.
 *
 * Torna `{ key, values, action }`: `action` è quello che il pulsante deve fare — aprire le
 * impostazioni, dove si collega la cartella e si riprende il permesso, oppure esportare subito.
 * L'ordine dei casi è l'ordine del danno: prima quello che sembra funzionare e non funziona.
 */
export function advice({ stato = {}, ultimoArchivio = null, ultimoMovimento = null,
                         documenti = 0, oggi = new Date().toISOString() } = {}) {
  const kind = stato.kind || "none";

  // Una cartella che ha smesso di ricevere copie si dice **sempre**, anche con un documento solo e
  // anche a chi ha esportato ieri: è lo stato in cui una persona crede di essere coperta e non lo è.
  if (kind === "held") {
    return { key: "safetyHeld", values: { folder: stato.folder || "" }, action: "settings" };
  }
  if (kind === "prompt") {
    return { key: "safetyPrompt", values: { folder: stato.folder || "" }, action: "settings" };
  }
  if (kind === "linked" && stato.error) {
    return { key: "safetyError", values: { folder: stato.folder || "", error: stato.error }, action: "settings" };
  }

  if (documenti < SOGLIA_DOCUMENTI) return null;

  // Collegata e funzionante: l'unico stato in cui non c'è niente da dire. Una cartella senza ancora
  // nessuna copia scritta è comunque a posto — scrive alla prima modifica — tranne che non lo si è
  // mai visto succedere, e allora vale la pena dirlo una volta.
  if (kind === "linked") {
    return stato.lastWrite ? null : { key: "safetyNever", values: { folder: stato.folder || "" }, action: "settings" };
  }

  // Il browser saprebbe tenere la copia da sé, e nessuno gliel'ha chiesto.
  if (kind === "none") {
    return { key: "safetyNoFolder", values: {}, action: "settings" };
  }

  // Qui la cartella non esiste: Firefox, Safari, un telefono. L'unica copia la fa una persona, e il
  // promemoria torna finché il lavoro fatto dopo non è stato messo al sicuro.
  // Una data che non si legge vale come «non mi risulta nessuna copia», mai come «sei a posto»:
  // un `localStorage` scritto a mano o da una versione di prima non deve poter spegnere l'avviso.
  if (!ultimoArchivio || Number.isNaN(Date.parse(ultimoArchivio))) {
    return { key: "safetyManualNever", values: {}, action: "export" };
  }
  const giorni = _giorni(ultimoArchivio, oggi);
  const lavorato = ultimoMovimento && Date.parse(ultimoMovimento) > Date.parse(ultimoArchivio);
  if (lavorato || (giorni !== null && giorni >= GIORNI_ARCHIVIO)) {
    return { key: "safetyManualOld", values: { giorni: giorni === null ? 0 : giorni }, action: "export" };
  }
  return null;
}
