// Ferie del team: tool di esempio per ShareBox. Dati nella collezione "assenze";
// identità e permessi li dà la piattaforma (sharebox.me, record.canEdit).
"use strict";

const assenze = sharebox.collection("assenze");
const TIPI = { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia", altro: "Altro" };
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const GIORNI = ["D", "L", "M", "M", "G", "V", "S"];

let io = null;
let records = [];
let modifica = null; // id del record in modifica
const oggi = isoDi(new Date());
let meseVisto = { anno: new Date().getFullYear(), mese: new Date().getMonth() };

// ---------- date (stringhe ISO AAAA-MM-GG, calcoli in UTC per evitare sorprese col fuso) ----------

function isoDi(date) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}
function utc(iso) {
  const [a, m, g] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, g);
}
function isoUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
const GIORNO = 86_400_000;

/** Pasqua (algoritmo di Gauss/Meeus), per calcolare il Lunedì dell'Angelo. */
function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(anno, mese - 1, giorno);
}
const festiviCache = new Map();
function festivi(anno) {
  if (!festiviCache.has(anno)) {
    const fissi = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"].map((md) => `${anno}-${md}`);
    festiviCache.set(anno, new Set([...fissi, isoUtc(pasqua(anno) + GIORNO)]));
  }
  return festiviCache.get(anno);
}
function nonLavorativo(iso) {
  const giorno = new Date(utc(iso)).getUTCDay();
  return giorno === 0 || giorno === 6 || festivi(Number(iso.slice(0, 4))).has(iso);
}
function giorniLavorativi(dal, al, anno) {
  let n = 0;
  for (let t = utc(dal); t <= utc(al); t += GIORNO) {
    const iso = isoUtc(t);
    if ((anno === undefined || iso.startsWith(String(anno))) && !nonLavorativo(iso)) n++;
  }
  return n;
}
const formato = new Intl.DateTimeFormat("it", { day: "numeric", month: "short", timeZone: "UTC" });
const formatoAnno = new Intl.DateTimeFormat("it", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function periodo(dal, al) {
  if (dal === al) return formatoAnno.format(utc(dal));
  const stessoAnno = dal.slice(0, 4) === al.slice(0, 4);
  return `dal ${(stessoAnno ? formato : formatoAnno).format(utc(dal))} al ${formatoAnno.format(utc(al))}`;
}

// ---------- utilità ----------

function h(tag, attrs = {}, ...figli) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const f of figli.flat()) if (f != null && f !== false) el.append(f instanceof Node ? f : String(f));
  return el;
}
function mostraErrore(e) {
  const box = document.getElementById("errore");
  box.textContent = e ? e.message || String(e) : "";
  box.hidden = !e;
}
const nomeDi = (r) => r.owner.name || r.owner.email;
const mio = (r) => r.owner.email === io.email;

// ---------- modulo ----------

const modulo = document.getElementById("modulo");
function aggiornaAnteprima() {
  const { dal, al } = modulo.elements;
  const testo = document.getElementById("anteprima-giorni");
  if (dal.value && al.value && al.value >= dal.value) {
    const n = giorniLavorativi(dal.value, al.value);
    testo.textContent = `${n} ${n === 1 ? "giorno lavorativo" : "giorni lavorativi"}`;
  } else testo.textContent = "";
}
modulo.elements.dal.addEventListener("change", () => {
  if (!modulo.elements.al.value || modulo.elements.al.value < modulo.elements.dal.value) modulo.elements.al.value = modulo.elements.dal.value;
  aggiornaAnteprima();
});
modulo.elements.al.addEventListener("change", aggiornaAnteprima);

function iniziaModifica(r) {
  modifica = r.id;
  for (const campo of ["dal", "al", "tipo", "nota"]) modulo.elements[campo].value = r.data[campo] ?? "";
  document.getElementById("titolo-modulo").textContent = mio(r) ? "Modifica assenza" : `Modifica assenza di ${nomeDi(r)}`;
  document.getElementById("salva").textContent = "Salva modifiche";
  document.getElementById("annulla").hidden = false;
  aggiornaAnteprima();
  modulo.scrollIntoView({ behavior: "smooth", block: "center" });
}
function fineModifica() {
  modifica = null;
  modulo.reset();
  document.getElementById("titolo-modulo").textContent = "Nuova assenza";
  document.getElementById("salva").textContent = "Aggiungi";
  document.getElementById("annulla").hidden = true;
  aggiornaAnteprima();
}
document.getElementById("annulla").addEventListener("click", fineModifica);

modulo.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const dati = Object.fromEntries(["dal", "al", "tipo", "nota"].map((c) => [c, modulo.elements[c].value.trim()]));
  if (dati.al < dati.dal) return mostraErrore(new Error("La data di fine è prima di quella di inizio"));
  const sovrapposta = records.find((r) => mio(r) && r.id !== modifica && r.data.dal <= dati.al && r.data.al >= dati.dal);
  if (sovrapposta && !confirm(`Hai già un'assenza ${periodo(sovrapposta.data.dal, sovrapposta.data.al)}. Salvare comunque?`)) return;
  const pulsante = document.getElementById("salva");
  pulsante.disabled = true;
  try {
    if (modifica) await assenze.update(modifica, dati);
    else await assenze.add(dati);
    fineModifica();
    mostraErrore(null);
    await carica();
  } catch (e) {
    mostraErrore(e);
  } finally {
    pulsante.disabled = false;
  }
});

async function elimina(r) {
  if (!confirm(`Eliminare l'assenza di ${nomeDi(r)} ${periodo(r.data.dal, r.data.al)}?`)) return;
  try {
    await assenze.remove(r.id);
    if (modifica === r.id) fineModifica();
    await carica();
  } catch (e) {
    mostraErrore(e);
  }
}

// ---------- viste ----------

function persone() {
  const mappa = new Map();
  for (const r of records) mappa.set(r.owner.email, nomeDi(r));
  if (io) mappa.set(io.email, io.name || io.email);
  return [...mappa].sort((a, b) => (a[0] === io?.email ? -1 : b[0] === io?.email ? 1 : a[1].localeCompare(b[1], "it")));
}

function disegnaCalendario() {
  const { anno, mese } = meseVisto;
  document.getElementById("mese-nome").textContent = `${MESI[mese]} ${anno}`;
  const giorni = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
  const isoGiorno = (g) => `${anno}-${String(mese + 1).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
  const intestazione = h(
    "tr",
    {},
    h("th", { class: "nome", scope: "col" }, "Persona"),
    Array.from({ length: giorni }, (_, i) => {
      const iso = isoGiorno(i + 1);
      const classi = [nonLavorativo(iso) && "festivo", iso === oggi && "oggi"].filter(Boolean).join(" ");
      return h("th", { scope: "col", class: classi || null }, String(i + 1), h("br"), GIORNI[new Date(utc(iso)).getUTCDay()]);
    }),
  );
  const righe = persone().map(([email, nome]) =>
    h(
      "tr",
      {},
      h("td", { class: "nome", title: email }, nome),
      Array.from({ length: giorni }, (_, i) => {
        const iso = isoGiorno(i + 1);
        const assenza = records.find((r) => r.owner.email === email && r.data.dal <= iso && r.data.al >= iso);
        const classi = [nonLavorativo(iso) && "festivo", iso === oggi && "oggi", assenza && `assente ${assenza.data.tipo}`].filter(Boolean).join(" ");
        return h("td", { class: classi || null, title: assenza ? `${nome}: ${TIPI[assenza.data.tipo] ?? "Assenza"}${assenza.data.nota ? ` (${assenza.data.nota})` : ""}` : null });
      }),
    ),
  );
  document.getElementById("calendario").replaceChildren(h("thead", {}, intestazione), h("tbody", {}, righe));
}

function disegnaProssime() {
  const soloMie = document.getElementById("solo-mie").checked;
  const lista = records
    .filter((r) => r.data.al >= oggi && (!soloMie || mio(r)))
    .sort((a, b) => a.data.dal.localeCompare(b.data.dal) || nomeDi(a).localeCompare(nomeDi(b), "it"));
  const ul = document.getElementById("prossime");
  if (lista.length === 0) {
    ul.replaceChildren(h("li", { class: "vuoto" }, soloMie ? "Non hai assenze in programma." : "Nessuna assenza in programma. Aggiungi la prima qui sopra."));
    return;
  }
  ul.replaceChildren(
    ...lista.map((r) => {
      const n = giorniLavorativi(r.data.dal, r.data.al);
      const inCorso = r.data.dal <= oggi;
      return h(
        "li",
        {},
        h("span", { class: `punto ${r.data.tipo}`, "aria-hidden": "true" }),
        h("span", { class: "chi" }, nomeDi(r), mio(r) ? " (tu)" : ""),
        h(
          "span",
          { class: "dettaglio" },
          `${TIPI[r.data.tipo] ?? "Assenza"} ${periodo(r.data.dal, r.data.al)} · ${n} ${n === 1 ? "giorno lavorativo" : "giorni lavorativi"}`,
          inCorso ? " · in corso" : "",
          r.data.nota ? ` · ${r.data.nota}` : "",
        ),
        r.canEdit
          ? h(
              "span",
              { class: "comandi" },
              h("button", { type: "button", class: "secondario piccolo", onclick: () => iniziaModifica(r) }, "Modifica"),
              h("button", { type: "button", class: "secondario piccolo", onclick: () => elimina(r) }, "Elimina"),
            )
          : null,
      );
    }),
  );
}

function disegnaRiepilogo() {
  const anno = meseVisto.anno;
  document.getElementById("titolo-riepilogo").textContent = `Riepilogo ${anno}`;
  const tipi = Object.keys(TIPI);
  const righe = persone().map(([email, nome]) => {
    const conti = Object.fromEntries(tipi.map((t) => [t, 0]));
    for (const r of records) if (r.owner.email === email) conti[r.data.tipo] = (conti[r.data.tipo] ?? 0) + giorniLavorativi(r.data.dal, r.data.al, anno);
    const totale = tipi.reduce((s, t) => s + conti[t], 0);
    return h("tr", {}, h("td", {}, nome), tipi.map((t) => h("td", {}, conti[t] || "–")), h("td", {}, h("strong", {}, String(totale))));
  });
  document.getElementById("riepilogo").replaceChildren(
    h("thead", {}, h("tr", {}, h("th", {}, "Persona"), tipi.map((t) => h("th", {}, TIPI[t])), h("th", {}, "Totale"))),
    h("tbody", {}, righe),
  );
}

function disegna() {
  disegnaCalendario();
  disegnaProssime();
  disegnaRiepilogo();
}

async function carica() {
  records = (await assenze.list()).filter((r) => r.data && r.data.dal && r.data.al);
  disegna();
}

document.getElementById("mese-prima").addEventListener("click", () => {
  meseVisto = meseVisto.mese === 0 ? { anno: meseVisto.anno - 1, mese: 11 } : { ...meseVisto, mese: meseVisto.mese - 1 };
  disegna();
});
document.getElementById("mese-dopo").addEventListener("click", () => {
  meseVisto = meseVisto.mese === 11 ? { anno: meseVisto.anno + 1, mese: 0 } : { ...meseVisto, mese: meseVisto.mese + 1 };
  disegna();
});
document.getElementById("solo-mie").addEventListener("change", disegnaProssime);

(async () => {
  try {
    io = await sharebox.me();
    document.getElementById("saluto").textContent =
      `Ciao ${io.name || io.email}` + (io.role === "manage" ? ": gestisci il tool e puoi modificare le assenze di tutti." : ": puoi aggiungere e modificare le tue assenze.");
    await carica();
  } catch (e) {
    document.getElementById("saluto").textContent = "";
    mostraErrore(e);
  }
})();
