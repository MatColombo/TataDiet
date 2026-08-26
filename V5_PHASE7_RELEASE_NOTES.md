# TataDiet V5 - Release notes Fase 7

**Checkpoint:** `5.0.0-alpha.7-phase7`  
**Data:** 26 agosto 2026

## Obiettivo

Far convergere tutte le viste operative sul medesimo piano effettivo locale creato nelle Fasi 5-6, eliminando la precedente separazione tra Planner/Compositore e moduli V4.

## Nuovi moduli

- `static/assets/js/v5-effective-core.js`: resolver puro per eventi civili, nutrienti, meal-prep, spesa, ricerca e ICS.
- `static/assets/js/v5-effective-store.js`: caricamento coordinato di piano, giornate, ricette, versioni, ingredienti e revisioni da IndexedDB.
- `static/assets/js/v5-effective-pages.js`: adattamento Home/Oggi al piano effettivo.

## Integrazioni

### Home e Oggi

Home segnala il piano personale attivo. Oggi mostra giorno/turno/aderenza/pasti effettivi e ricalcola nutrienti dalle versioni ricetta assegnate e dai moltiplicatori di porzione.

### Preparazioni 48 ore

`prep.js` usa gli eventi effettivi e i metadati delle versioni ricetta per la finestra mobile 0-24 / 24-48 ore.

### Spesa

`shopping-range.js` aggrega gli ingredienti dalle ricette effettive, non dal solo dettaglio statico per giorno. La semantica dell'intervallo è per data civile di consumo.

### Ricerca

`search.js` unisce all'indice statico ricette personali, ingredienti personali e giornate effettive modificate. I risultati restano locali.

### ICS

`tools.js` esporta il piano effettivo con `Europe/Rome`, CRLF e line folding <=75 byte. D1/D2/CUSTOM temporizzati quando dispongono di un turno; gli altri tipi sono all-day.

## Correzioni emerse durante il QA

- riallineato il template del Compositore al filtro `data-picker-fit` già previsto dal JavaScript della Fase 6;
- aggiunto bootstrap visuale per la sorgente “Piano personale”;
- ricerca ingrediente personale collegata direttamente al relativo editor;
- corretti i test browser asincroni del Planner per attendere il commit IndexedDB invece di usare ritardi fissi.

## QA

Build finale:

```text
588 HTML
38.259 link/risorse/frammenti
639 risorse offline
0 errori
0 warning
```

Test specifici resolver:

- coda civile oltre mezzanotte;
- nutrienti effettivi;
- finestra 48 ore;
- spesa da versioni ricetta;
- ingrediente personale senza rounding rule;
- ICS effettivo e folding;
- ricerca personale;
- guardia data iniziale e caricamento context.

QA Chromium finale: **15/15 controlli**, errori JavaScript **0**. Lo scenario modifica la porzione di un pasto e verifica la propagazione a Oggi, Preparazioni, Spesa, poi converte la data in FREE e verifica Oggi, Spesa, Ricerca, ICS e Home.

## Limiti residui

La Fase 7 completa la propagazione funzionale ma non è ancora la release stabile V5. Restano alla Fase 8:

- test migrazioni da tutte le alpha e da V4 su dataset reali;
- audit accessibilita completo;
- stress test con molte ricette/ingredienti personali;
- verifica offline e aggiornamento PWA su dispositivi reali;
- QA manuale iOS/Android;
- pulizia definitiva di compatibilita e documentazione release.
