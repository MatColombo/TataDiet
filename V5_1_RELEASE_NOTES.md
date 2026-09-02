# TataDiet 5.1.0 — Release notes

**Data:** 2 settembre 2026  
**Tipo:** minor release compatibile con V5.0  
**Database:** `tatadiet-v5`, DB version 1, schema 1

## Obiettivo

Ridurre il numero di passaggi necessari per modificare il calendario e introdurre preferenze alimentari locali, mantenendo intatta la compatibilità con i dati V5.

## Nomenclatura e colori

- D1 → Giornata / G / ocra `#a66a21`
- D2 → Notte / N / blu intenso `#173b83`
- D3 → Smonto / SN / azzurro `#58a9d6`
- D4 → Riposo 1 / R1 / verde `#3e8a59`
- D5 → Riposo 2 / R2 / verde `#3e8a59`
- Mattino / M / giallo tuorlo `#e5a700`
- Pomeriggio / P / rosso intenso `#b6242d`

D1-D5 restano valori interni nel dataset base; non sono più mostrati nell'HTML pubblico. M e P sono nuovi valori ammessi nei `calendarDay` personali e usano il profilo alimentare D1.

## Gestisci giornata

Nuova pagina `/calendario/gestisci/` con:

- calendario mensile navigabile;
- selezione immediata del tipo;
- menu mantenuto/adattato/personalizzato;
- modifica di singoli piatti senza cambiare pagina;
- aderenza e azioni strutturali;
- anteprima dell'impatto;
- una sola conferma finale;
- una sola operazione undo/redo per la modifica composta.

Il cambio di tipo seleziona automaticamente **Adatta menu**.

## Preferenze alimentari

Nuova pagina `/preferenze/` e setting `foodPreferencesV1`.

Livelli: `more`, `normal`, `less`, `rare`, `never`, con massimo opzionale di occasioni per 7 giorni.

Il motore conta occasioni per pasto in una finestra mobile di 7 giorni e aggiorna il conteggio anche mentre compone i diversi slot della stessa giornata.

`never` e un limite già raggiunto rendono la ricetta non eleggibile per la proposta automatica, senza rimuoverla dalla selezione manuale.

Le famiglie iniziali sono uova, latte/yogurt, formaggi, affettati, pesce, legumi e carne rossa. La classificazione usa gli ingredienti reali delle versioni ricetta; `formaggio primosale` è riconosciuto come formaggio, mentre `latte di cocco` non viene contato come latticino.

## Backup e PWA

- `appVersion` dei nuovi backup: `5.1.0`;
- backup V5.0/schema 1 restano importabili con warning di versione;
- Gestisci giornata e Preferenze sono nella cache core;
- shortcut PWA principale del calendario indirizza a Gestisci giornata.

## Compatibilità

Nessuna modifica a `DB_VERSION` o `SCHEMA_VERSION`. I record personali V5.0 non vengono riscritti. I valori D1-D5 conservati nei record esistenti restano validi e vengono mappati alla nuova nomenclatura in presentazione.

## Gate di rilascio finale

Build verificata il 2 settembre 2026:

- 590 pagine HTML;
- 41.327 link, risorse e frammenti controllati;
- 0 errori e 0 warning di validazione;
- 645 risorse nella libreria offline (16.664.804 byte);
- audit accessibilita su 590 pagine: 1.183 immagini, 2.196 pulsanti, 19.497 link e 2.208 controlli form, con 0 errori e 0 warning;
- stress test: 96 operazioni con undo completo e redo completo;
- QA Chromium V5.1: 20 controlli, tutti superati, inclusi M/P, palette, adattamento menu, preferenze alimentari, backup, offline e viewport mobile.
