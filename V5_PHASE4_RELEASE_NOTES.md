# TataDiet V5 - Fase 4 · Studio ricette

**Checkpoint:** `5.0.0-alpha.4-phase4`  
**Database:** `tatadiet-v5` · schema IndexedDB 1  
**Migrazione contenuto ricette:** `phase4RecipeShapeVersion = 4`

## Obiettivo

La Fase 4 aggiunge un editor ricette local-first sopra le revisioni ingrediente della Fase 3, senza introdurre ancora il calendario effettivo modificabile.

## Funzioni implementate

- pagina `ricette/studio/`;
- catalogo con ricette TataDiet e personali;
- creazione di ricette personali;
- duplicazione dei base senza alterare l'originale;
- picker ingredienti base/personali;
- quantità in g/ml e unità di conversione della revisione ingrediente;
- normalizzazione delle quantità;
- ricalcolo live totale/per porzione;
- porzioni;
- tipo pasto, cucina, tag, tempo, istruzioni, intensità aromatica e dati meal-prep;
- warning per fibra elevata e titoli duplicati;
- blocco delle conversioni mancanti;
- famiglia ricetta stabile e nuova versione a ogni modifica;
- storico versioni;
- riferimento immutabile a `ingredientRevisionId` per ogni riga;
- archiviazione, riattivazione ed eliminazione protetta;
- backup `recipes` con dipendenze ingrediente/revisione;
- supporto PWA/offline;
- link dall'archivio statico e da ciascuna ricetta base allo Studio.

## Decisione di integrazione

La Fase 4 **non** modifica ancora le 864 occorrenze del piano. Le azioni “solo questo pasto” e “applica alle occorrenze future” richiedono il calendario effettivo materializzato e verranno implementate nelle Fasi 5-6. Questo evita di creare override temporanei incompatibili con la futura sequenza modificabile.

## Migrazione alpha

Installazioni già inizializzate vengono aggiornate in modo idempotente. La migrazione Fase 4 risemina solo i record **base** di ricette/versioni dal dataset statico e normalizza:

- tipi di pasto dalla famiglia;
- meal-prep a booleani/ore;
- cucina e metadati base.

Le ricette personali non vengono toccate.

## QA

Gate canonico:

```bash
./phase4.sh
```

Ultima build validata:

```text
586 pagine HTML
32.279 link/risorse/frammenti verificati
627 risorse offline
306 ricette base
547 versioni ricetta base
130 ingredienti base
0 errori sito
0 warning sito
```

Copertura specifica:

- normalizzazione conversioni;
- ricalcolo calorie/macronutrienti/fibra;
- valori per porzione;
- conservazione della revisione ingrediente storica;
- creazione ricetta/versione;
- `supersedesVersionId`;
- digest di input;
- warning fibra/titolo duplicato;
- conversione mancante bloccante;
- persistenza store, versione 2 e storico;
- protezione record base;
- archiviazione/riattivazione;
- eliminazione protetta da riferimenti;
- backup ricette con dipendenze;
- validazione JSON Schema di ricetta/versione e ingrediente/revisione;
- regressioni Fasi 1-3 e logica V4.

QA browser:

```bash
python3 scripts/qa_v5_phase4.py --base-url https://TUO-UTENTE.github.io/TataDiet
```

Nell'ambiente di build corrente Chromium di sistema è disponibile, ma la policy amministrativa blocca `localhost` con `ERR_BLOCKED_BY_ADMINISTRATOR`; il test browser va eseguito sul deploy GitHub Pages o su un browser locale.

## Prossimo gate

La Fase 5 può introdurre il **calendario effettivo**:

- stato seguito/parziale/non seguito;
- giornata libera/OFF;
- cambio D1-D5;
- turno personalizzato;
- inserimento/rimozione/posticipo della sequenza;
- anteprima dell'impatto;
- operazioni annullabili.
