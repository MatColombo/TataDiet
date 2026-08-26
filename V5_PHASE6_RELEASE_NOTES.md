# TataDiet V5 — Release notes Fase 6

**Checkpoint:** `5.0.0-alpha.6-phase6`  
**Data:** 26 agosto 2026

## Obiettivo

La Fase 6 introduce il **Compositore della giornata** sul calendario effettivo creato in Fase 5. Il piano base, le ricette base e le revisioni ingrediente restano immutabili; le scelte dell'utente vengono salvate nelle `calendarDays` personali e nella cronologia operazioni IndexedDB.

## Funzioni introdotte

- nuova route `/calendario/componi/index.html`;
- sostituzione di una singola ricetta/occorrenza;
- scelta tra ricette TataDiet e ricette personali;
- modifica di orario, tipo di pasto e moltiplicatore di porzione;
- aggiunta e rimozione di pasti;
- blocco di un pasto contro le proposte automatiche;
- riepilogo live di kcal, proteine, carboidrati, grassi e fibra;
- caricamento di uno qualunque dei 180 menu-giorno TataDiet;
- proposte complete con anteprima e spiegazioni;
- slot standard per D1–D5/OFF e slot dinamici per `CUSTOM`, inclusi turni oltre mezzanotte;
- filtri libreria per origine, consumo freddo, rapidità, fibra moderata e assenza di necessità di riscaldamento;
- ranking che considera slot, capacità del turno, meal-prep, tempo, fibra, spezie e ripetizioni recenti;
- undo/redo condiviso col Planner;
- disponibilità PWA/offline.

## Versionamento

Il catalogo del compositore risolve tutte le **547 versioni ricetta** necessarie al piano storico. Una giornata continua quindi a utilizzare l'esatta `recipeVersionId` con cui è stata salvata. Nei suggerimenti viene mostrata una sola versione corrente per ricetta non archiviata.

## Nutrizione

Il totale giornaliero usa i nutrienti della specifica versione ricetta moltiplicati per `portionMultiplier`. Il riferimento energetico visualizzato è un confronto operativo col piano base, non un nuovo obiettivo clinico.

## Confine della fase

`Oggi`, `Preparazioni 48h`, `Spesa`, `ICS` e ricerca non sono ancora migrati al piano effettivo. Questa convergenza è il gate della Fase 7, così non vengono introdotte logiche duplicate o parziali.

## QA

Gate cumulativo: `./phase6.sh`.

Ultima build validata prima del packaging:

```text
588 pagine HTML
36.495 collegamenti/risorse/frammenti
636 risorse offline
0 errori
0 warning
180 giorni base
864 pasti base
306 ricette base
547 versioni ricetta risolvibili
```

La QA Chromium verifica caricamento, picker e filtri, sostituzione, porzione, blocco, suggerimento, copia menu base, undo, aggiunta manuale e layout mobile.
