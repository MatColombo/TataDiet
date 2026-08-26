# V5 Fase 5 — Calendario effettivo

**Checkpoint:** `5.0.0-alpha.5-phase5`  
**Persistenza:** IndexedDB `tatadiet-v5`, schema DB 1  
**Ambito:** piano personale, giornate, turni, sequenza, operazioni annullabili

## Cosa cambia

La Fase 5 materializza il template statico dei 180 giorni in un `planInstance` personale. Il dataset TataDiet resta immutabile; tutte le eccezioni vengono salvate in `planInstances`, `calendarDays` e `operations`.

Pagina principale:

```text
/calendario/modifica/index.html
```

La vista mensile `/calendario/` evidenzia le giornate personalizzate e collega le giornate modificate al Planner.

## Operazioni supportate

- aderenza: `planned`, `followed`, `partial`, `not-followed`;
- sostituzione D1–D5 mantenendo i pasti esistenti;
- `OFF` per giornata fuori servizio mantenendo il menu;
- turno `CUSTOM` con inizio, fine, passaggio mezzanotte e capacità operative;
- `FREE` per lasciare la data libera e rimuovere il menu di quella data;
- `postpone-sequence`: inserisce una giornata libera e sposta tutto il futuro di +1 giorno;
- `insert-day`: inserisce una giornata nella sequenza e prolunga il piano;
- `remove-day`: rimuove l'assegnazione e anticipa il futuro di un giorno;
- `restore-day`: ripristina turno e pasti dalla giornata base di origine;
- `restore-from-date`: scarta le modifiche future e riprende la sequenza base coerentemente con eventuali inserimenti/rimozioni precedenti;
- undo/redo persistente tramite record `operationRecord`.

`not-followed` è uno stato di aderenza, non un tipo giorno: segnare una giornata come non seguita non sposta la sequenza.

## Regola pasti nella Fase 5

Quando si cambia D1–D5, OFF o un turno CUSTOM, i pasti già collegati vengono conservati. `FREE` li rimuove. Le giornate inserite nascono senza menu. La selezione/sostituzione dei piatti e i suggerimenti automatici sono intenzionalmente rimandati alla Fase 6.

## Piano attivo e cambio data iniziale

La chiave `activePlanInstanceId` identifica il piano in uso. Se l'utente cambia la data iniziale viene creato un nuovo piano e quello precedente viene archiviato. Tornando a una data iniziale già usata, TataDiet riattiva il relativo piano esistente con tutte le personalizzazioni, invece di crearne una copia vuota.

## Backup

Il backup `calendar` e il backup `full` includono:

- `planInstances`;
- `calendarDays`;
- `operations`.

Il checksum SHA-256, l'anteprima di import e il rollback della Fase 2 restano invariati.

## QA

Gate cumulativo:

```bash
./phase5.sh
```

QA browser:

```bash
python3 scripts/qa_v5_phase5.py --base-url https://TUO-UTENTE.github.io/TataDiet
```

L'ultima build validata contiene 587 pagine HTML e 632 risorse offline. Il gate controlla anche regressioni Fasi 1–4, schema di `planInstance`, `calendarDay` e `operationRecord`, sequenze 179/180/181 giorni, turno D2 oltre mezzanotte e backup calendario.

## Fuori ambito

La Fase 5 non rende ancora il piano effettivo sorgente di tutte le viste. `Oggi`, preparazioni 48h, spesa, ICS e riepiloghi nutrizionali saranno migrati al piano effettivo nella Fase 7, dopo il compositore pasti della Fase 6.

## Verifica finale del bootstrap locale

La QA browser della build di consegna viene eseguita anche con un profilo IndexedDB vuoto. `v5-db.js` risolve ora i dataset statici rispetto a `data-root`, quindi l'inizializzazione funziona correttamente anche da route annidate come `/calendario/modifica/`, `/ingredienti/` e `/ricette/studio/` senza richiedere una visita preventiva alla home.

Esito Chromium finale: **9/9 controlli superati, 0 errori**.
