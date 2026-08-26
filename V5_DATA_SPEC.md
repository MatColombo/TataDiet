# TataDiet V5 - Specifica dati stabile

**Stato del documento:** contratto dati implementato nella release 5.0.0  
**Versione applicativa:** `5.0.0`  
**Versione dataset base:** `tatadiet-base-v1`  
**Formato schemi:** JSON Schema Draft 2020-12

## 1. Scopo

Questa specifica definisce il modello dati necessario per trasformare TataDiet da piano statico consultabile a planner alimentare personale local-first.

La V5 permette di:

- creare ingredienti personali con valori nutrizionali;
- creare e versionare ricette;
- modificare una ricetta globalmente o soltanto in un pasto;
- ricalcolare nutrienti e spesa;
- modificare giornate, turni e sequenza del piano;
- mantenere uno storico coerente;
- esportare e importare tutti i dati personali in JSON;
- funzionare offline senza account e senza backend.

La release 5.0.0 implementa IndexedDB, backup, Studio ingredienti, Studio ricette, calendario effettivo, Compositore e resolver unico del piano effettivo.

---

## 2. Principi architetturali

### 2.1 Local-first

I dati personali risiedono nel browser. GitHub Pages continua a distribuire soltanto:

- applicazione;
- dataset base;
- HTML, CSS e JavaScript;
- service worker;
- schemi e migrazioni.

Nessun dato personale viene salvato nel repository.

### 2.2 Separazione tra base e personale

```text
BASE IMMUTABILE
+ DATI PERSONALI
+ OVERRIDE DI OCCORRENZA
= PIANO EFFETTIVO
```

Il livello base comprende:

- 130 ingredienti;
- 306 famiglie di ricette;
- 547 versioni di ricetta;
- 180 giornate template;
- 864 occorrenze pasto.

Il livello personale comprende:

- ingredienti creati dall'utente;
- ricette e versioni personali;
- calendario materializzato;
- sostituzioni dei pasti;
- variazioni di porzione;
- stato di aderenza;
- cronologia delle operazioni;
- checklist e impostazioni.

### 2.3 Immutabilità del base dataset

Un record con:

```json
{
  "origin": "base",
  "immutable": true
}
```

non può essere aggiornato o eliminato dal browser.

Le azioni consentite sono:

- duplicazione come record personale;
- uso in una ricetta personale;
- override di una singola occorrenza;
- archiviazione della copia personale.

### 2.4 Piano originale sempre ripristinabile

Il piano base non viene mai distrutto. Deve essere sempre possibile:

- ripristinare una giornata;
- ripristinare il piano da una data;
- eliminare tutte le personalizzazioni;
- ricostruire il calendario a partire dalla data iniziale.

### 2.5 Unica fonte per il piano effettivo

Tutti i moduli V5 devono leggere da un unico servizio logico:

```text
EffectivePlanRepository
```

Non è ammesso che un modulo legga direttamente `calendar.json` mentre un altro usa IndexedDB.

Il repository effettivo deve alimentare:

- Oggi;
- calendario;
- preparazioni 48 ore;
- spesa;
- ricerca;
- riepiloghi nutrizionali;
- stampa;
- esportazione ICS;
- backup.

### 2.6 Due contratti, un solo modello applicativo

La Fase 1 distingue deliberatamente due livelli:

1. **Trasporto del dataset base**, immutabile e generato in build, in `snake_case`:
   - schemi: `schemas/v5/base/*.schema.json`;
   - snapshot: `v5_data/base/*.json`.
2. **Dominio locale e backup**, usato da IndexedDB e dall'applicazione, in `camelCase`:
   - schema: `schemas/v5/domain/tatadiet-v5.schema.json`;
   - esempi: `spec/v5/examples/*.json`.

Il livello base è volutamente compatto e può accorpare identità e revisione in un singolo record di trasporto. L'adattatore di inizializzazione della Fase 2 deve esporlo al dominio come record distinti e immutabili. Esempio:

```text
base transport ingredient
  id + revision_id + nutrients
        -> adapter
ingredient identity + ingredientRevision
```

Le equivalenze obbligatorie sono:

| Trasporto base | Dominio locale |
|---|---|
| `revision_id` | `currentRevisionId` e record `ingredientRevision.id` |
| `ingredient_revision_id` | `ingredientLines[].ingredientRevisionId` |
| `default_version_id` | versione predefinita di consultazione della ricetta base |
| `as_sold` | `as-sold` |
| `unspecified` | `unknown` |

Il backup esporta soltanto il modello di dominio normalizzato. Non deve serializzare direttamente gli snapshot base, ma deve dichiararne ID e hash.

### 2.7 Snapshot base prodotti dalla Fase 1

```text
v5_data/base/base-dataset-manifest.json
v5_data/base/ingredients.base.v1.json
v5_data/base/recipes.base.v1.json
v5_data/base/plan-template.base.v1.json
```

Il manifest contiene hash delle fonti e degli snapshot, conteggi e invarianti.

---

## 3. Identificatori

### 3.1 Namespace

| Oggetto | Base | Personale/importato |
|---|---|---|
| Ingrediente | `base:ingredient:<code>` | `usr:ingredient:<uuid>` / `imp:ingredient:<uuid>` |
| Famiglia ricetta | `base:recipe:<slug>` | `usr:recipe:<uuid>` / `imp:recipe:<uuid>` |
| Versione ricetta | `base:recipe-version:<slug>:<hash>` | `usr:recipe-version:<uuid>` / `imp:recipe-version:<uuid>` |
| Giorno template | `base:plan-day:<NNN>` | - |
| Occorrenza pasto base | `base:meal:<NNN>:<seq>` | `usr:meal:<uuid>` / `imp:meal:<uuid>` |
| Operazione | - | `usr:operation:<uuid>` |

Gli UUID personali devono essere generati con `crypto.randomUUID()` quando disponibile.

### 3.2 Stabilità

- L'ID di una famiglia di ricetta non cambia quando cambia la composizione.
- Ogni composizione distinta ha un proprio `recipeVersionId`.
- Una giornata punta a una versione specifica, non soltanto al titolo.
- Una modifica dello storico non deve cambiare retroattivamente la versione consumata.

---

## 4. Modello ingrediente

Il contratto normativo locale è costituito da `$defs.ingredient` e `$defs.ingredientRevision` in `schemas/v5/domain/tatadiet-v5.schema.json`. Lo snapshot base è validato da `schemas/v5/base/ingredient.schema.json`.

### 4.1 Campi obbligatori per un ingrediente personale

#### Identità

Il record `ingredient` contiene:

- `id`;
- `name`;
- categoria di spesa;
- alias;
- origine `personal` o `imported`;
- `currentRevisionId`;
- date di creazione, aggiornamento e archiviazione.

Il record `ingredientRevision` contiene i dati nutrizionali effettivi. Una revisione già referenziata non viene aggiornata in-place: una modifica crea una nuova revisione e aggiorna `currentRevisionId`.

#### Base nutrizionale

La base deve essere una delle seguenti:

```text
100 g
100 ml
```

Non è ammesso salvare direttamente valori “per porzione” come base canonica. Una porzione deve essere una conversione.

#### Nutrienti core obbligatori

- energia in kcal;
- proteine in g;
- carboidrati in g;
- grassi in g;
- fibra in g.

#### Nutrienti opzionali

- zuccheri;
- grassi saturi;
- sale;
- sodio.

I campi opzionali non devono impedire il salvataggio o il calcolo core.

#### Stato dell'alimento

Valori ammessi:

```text
raw
cooked
dry
drained
prepared
ready-to-eat
as-sold
unknown
```

Per un ingrediente personale l'interfaccia deve rendere evidente la differenza, per esempio:

```text
riso basmati secco
riso basmati cotto
```

Non devono condividere lo stesso record se hanno valori nutrizionali diversi.

#### Provenienza

Almeno uno tra:

- etichetta del prodotto;
- banca dati;
- stima manuale dichiarata;
- record importato.

Campi consigliati:

- nome della fonte;
- URL;
- marca;
- data di acquisizione;
- nota.

### 4.2 Conversioni

Le ricette possono usare unità diverse dalla base soltanto quando esiste una conversione esplicita.

Esempi:

```text
1 uovo = 50 g
1 cucchiaio di olio = 10 g
1 fetta di pane = 25 g
```

Una conversione contiene:

- unità di input;
- quantità equivalente;
- unità base `g` o `ml`;
- etichetta singolare e plurale;
- fonte o nota.

Non si assume automaticamente:

```text
1 ml = 1 g
```

La conversione g/ml richiede densità o equivalenza dichiarata.

### 4.3 Validazioni dell'editor ingrediente

#### Errori bloccanti

- nome vuoto;
- codice duplicato;
- base diversa da g/ml;
- quantità base non positiva;
- valore core mancante;
- valore negativo;
- conversione non positiva;
- unità di ricetta senza conversione;
- JSON non conforme allo schema.

#### Avvisi non bloccanti

- valori superiori a 100 g per singolo macronutriente;
- somma dei macronutrienti apparentemente incoerente;
- energia molto distante dalla stima Atwater;
- nome molto simile a un ingrediente esistente;
- stato `unknown`;
- fonte manuale senza nota;
- nutrienti opzionali assenti.

La stima energetica è soltanto un controllo di plausibilità:

```text
4 × proteine
+ 4 × carboidrati
+ 9 × grassi
```

Non deve sovrascrivere il valore di etichetta o banca dati.

### 4.4 Modifica ed eliminazione

- Un ingrediente base viene duplicato prima della modifica.
- Un ingrediente personale usato in ricette non può essere eliminato direttamente.
- Azioni consentite:
  - archivia;
  - sostituisci nelle ricette;
  - elimina se non referenziato.
- Le versioni storiche devono mantenere uno snapshot sufficiente a ricostruire i nutrienti usati al momento del consumo.


### 4.5 Stato implementazione Fase 3

Lo Studio ingredienti implementa il contratto precedente tramite:

```text
static/assets/js/v5-ingredients-core.js
static/assets/js/v5-ingredient-store.js
static/assets/js/v5-ingredients.js
templates/ingredients.html
```

Decisioni operative consolidate:

- i record base vengono normalizzati una sola volta alla forma di dominio tramite `phase3IngredientShapeVersion = 3`;
- un salvataggio personale crea sempre una nuova `ingredientRevision`;
- la revisione precedente non viene cancellata o aggiornata;
- il catalogo base non accetta update, archive o delete;
- l'eliminazione personale richiede zero riferimenti in `recipeVersions`;
- l'archiviazione è consentita anche quando esistono riferimenti;
- il controllo Atwater è soltanto un warning;
- i record prodotti dal core sono validati contro `tatadiet-v5.schema.json` dal gate della Fase 3.

---

## 5. Modello ricetta

Il contratto normativo locale è costituito da `$defs.recipe` e `$defs.recipeVersion` in `schemas/v5/domain/tatadiet-v5.schema.json`. Gli snapshot base sono validati da:

```text
schemas/v5/base/recipe-family.schema.json
schemas/v5/base/recipe-version.schema.json
```

### 5.1 Famiglia e versione

Una famiglia rappresenta l'identità semantica:

```text
“Pane bianco con mozzarella e pomodoro”
```

Una versione rappresenta la composizione specifica:

```text
Versione A: pane 60 g, mozzarella 60 g, pomodoro 100 g
Versione B: pane 75 g, mozzarella 60 g, pomodoro 100 g
```

La separazione è obbligatoria perché il dataset base contiene 306 famiglie e 547 versioni.

### 5.2 Campi della famiglia

- titolo;
- descrizione facoltativa;
- tipi di pasto;
- cucine;
- elenco delle versioni;
- versione corrente per le ricette personali;
- stato attivo/archiviato;
- origine.

### 5.3 Campi della versione

- `recipeId`;
- revisione;
- numero di porzioni;
- righe ingrediente;
- valori per porzione;
- tempo di preparazione;
- informazioni meal-prep;
- cucina;
- spezie;
- istruzioni;
- note pratiche;
- versione precedente facoltativa.

### 5.4 Righe ingrediente

Ogni riga conserva sia l'input dell'utente sia la quantità normalizzata:

```json
{
  "ingredientId": "usr:ingredient:...",
  "ingredientRevisionId": "usr:ingredient-revision:...@1",
  "quantity": 1,
  "unitCode": "piece",
  "basisAmount": 50,
  "basisUnit": "g",
  "conversionId": "..."
}
```

Il calcolo usa la quantità normalizzata `basisAmount`/`basisUnit` e i nutrienti della revisione `ingredientRevisionId`.

### 5.5 Calcolo nutrizionale

Per ogni ingrediente:

```text
fattore = quantità base / quantità della base nutrizionale
nutriente riga = fattore × nutriente ingrediente
```

Per la ricetta:

```text
totale ricetta = somma delle righe
valore per porzione = totale ricetta / porzioni
```

Il motore deve conservare maggiore precisione internamente e arrotondare soltanto in visualizzazione.

Precisione raccomandata:

- archiviazione: almeno 6 decimali;
- visualizzazione kcal: 0 o 1 decimale;
- macronutrienti: 1 decimale;
- quantità: precisione dipendente dall'unità.

### 5.6 Modalità nutrizionali

```text
calculated
manual
incomplete
```

#### `calculated`

Tutte le righe hanno un ingrediente valido e una conversione.

#### `manual`

Usato per piatti esterni o pasti flessibili senza composizione completa. Deve essere mostrato come stima.

#### `incomplete`

Almeno un ingrediente non ha dati sufficienti. La ricetta può essere salvata come bozza, ma non deve essere usata dal bilanciatore automatico senza avviso.

### 5.7 Applicazione delle modifiche

Quando una ricetta viene cambiata, l'utente deve scegliere:

```text
solo questa occorrenza
occorrenze future selezionate
salva in libreria senza sostituire
crea nuova ricetta
```

Le occorrenze passate non vengono aggiornate automaticamente.

### 5.8 Stato implementazione Fase 4

Il contratto ricetta è ora implementato nello Studio ricette. Decisioni consolidate:

- le ricette base restano immutabili e vengono personalizzate solo per duplicazione;
- ogni ricetta personale ha una famiglia stabile `usr:recipe:*` e versioni `usr:recipe-version:*`;
- ogni modifica crea una nuova versione e imposta `currentVersionId`, senza riscrivere le precedenti;
- ogni riga salva l'identità e la revisione esatta dell'ingrediente;
- una revisione ingrediente successiva non modifica i nutrienti delle versioni ricetta già salvate;
- quantità pratiche vengono convertite usando le conversioni della revisione ingrediente e normalizzate in g/ml;
- il calcolo conserva precisione interna e presenta valori per porzione;
- `calculation.inputDigest` usa SHA-256 quando disponibile ed è vincolato dal contratto a 64 caratteri esadecimali;
- lo Studio Fase 4 salva solo ricette `calculated` complete. Le modalità `manual` e `incomplete` restano nel dominio per fasi successive e importazioni;
- archiviazione non rompe lo storico; eliminazione è permessa solo in assenza di riferimenti nel piano locale;
- `phase4RecipeShapeVersion = 4` normalizza una sola volta le ricette base già seminate nelle alpha precedenti, includendo meal type e meal-prep strutturato;
- backup `recipes` include ingredienti, revisioni, ricette e versioni personali.

Gli override di singola occorrenza e l'applicazione alle occorrenze future sono rimandati alle Fasi 5-6, perché richiedono un piano effettivo materializzato.

---

## 6. Modello giornata e calendario

Il contratto normativo locale è `$defs.planInstance` e `$defs.calendarDay` in `schemas/v5/domain/tatadiet-v5.schema.json`. Il template base è validato da `schemas/v5/base/calendar-day.schema.json`.

### 6.1 Giorno template e giorno effettivo

Il giorno template non ha una data civile. Contiene la posizione nel piano base.

Il giorno effettivo contiene:

- data;
- tipo giornata;
- turno;
- pasti;
- stato di aderenza;
- eventuale riferimento al giorno base;
- origine della modifica.

### 6.2 Tipi giornata

```text
D1
D2
D3
D4
D5
CUSTOM
OFF
FREE
```

### 6.3 Stati di aderenza

```text
planned
followed
partial
not-followed
not-applicable
```

Lo stato di aderenza non modifica automaticamente la sequenza.

### 6.4 Operazioni semantiche

| Operazione | Effetto sulla data | Effetto sulla sequenza |
|---|---|---|
| Segna non seguito | resta | nessuno |
| Segna parziale | resta | nessuno |
| Giornata libera | resta | nessuno |
| Cambia tipo | resta | nessuno, salvo scelta esplicita |
| Inserisci giornata | nuova assegnazione | sposta il futuro in avanti |
| Rimuovi dalla sequenza | resta una data civile | anticipa il futuro |
| Posticipa da questa data | inserisce una pausa | sposta il futuro in avanti |
| Ripristina | resta | ricostruisce dal base |

### 6.5 Turni personalizzati

Un turno personalizzato deve conservare:

- ora di inizio;
- ora di fine;
- `endDayOffset`;
- nome e descrizione;
- vincoli pratici:
  - possibilità di riscaldare;
  - frigorifero disponibile;
  - numero di pause;
  - pasti consumabili rapidamente.

I pasti che attraversano la mezzanotte continuano a usare `dayOffset`.

### 6.6 Identità della giornata durante gli spostamenti

La data può cambiare, ma l'istanza della giornata deve mantenere un ID stabile per:

- cronologia;
- checklist;
- annullamento;
- riferimenti alle occorrenze.

La data non deve essere usata come unica chiave primaria.

---

## 7. Override delle occorrenze

Una modifica occasionale non crea necessariamente una nuova ricetta globale.

Un `mealOverride` dovrà poter rappresentare:

- versione sostitutiva;
- moltiplicatore di porzione;
- orario diverso;
- pasto rimosso;
- pasto aggiunto;
- nota;
- stato consumato/parziale/saltato.

Regola:

```text
base occurrence
+ occurrence override
= effective occurrence
```

Il motore della spesa e dei nutrienti usa l'occorrenza effettiva.

---

## 8. Persistenza IndexedDB prevista per la Fase 2

### 8.1 Nome e versione

```text
database: tatadiet-v5
schema version iniziale: 1
```

### 8.2 Object store proposti

| Store | Chiave | Indici principali |
|---|---|---|
| `meta` | `key` | - |
| `settings` | `key` | - |
| `ingredients` | `id` | `origin`, `nameNormalized`, `category`, `archivedAt` |
| `ingredientRevisions` | `id` | `ingredientId`, `revisionNumber`, `createdAt` |
| `recipes` | `id` | `origin`, `titleNormalized`, `archivedAt` |
| `recipeVersions` | `id` | `recipeId`, `versionNumber`, `createdAt` |
| `planInstances` | `id` | `status`, `startDate`, `updatedAt` |
| `calendarDays` | `id` | `planInstanceId`, `date`, `dayType`, `sequenceIndex` |
| `operations` | `id` | `planInstanceId`, `kind`, `createdAt`, `undoneAt` |
| `shoppingChecklists` | `id` | `scopeKey`, `updatedAt` |

### 8.3 Transazioni

Le operazioni estese devono essere atomiche.

Esempio: inserire una giornata deve aggiornare nella stessa transazione:

- giornate future;
- occorrenze;
- registro operazioni;
- metadati della durata.

Se una scrittura fallisce, nessuna parte dell'operazione deve restare applicata.

### 8.4 Migrazioni

Ogni upgrade IndexedDB deve:

1. verificare la versione precedente;
2. creare un backup logico o checkpoint;
3. applicare la migrazione;
4. validare i conteggi;
5. aggiornare `meta.schemaVersion`;
6. non cancellare store sconosciuti senza una procedura esplicita.

---

## 9. Backup JSON

Lo schema dell'involucro è `$defs.backupEnvelope` in `schemas/v5/domain/tatadiet-v5.schema.json`.

### 9.1 Tipi di export

```text
full
recipes
calendar
settings
```

#### Full

Include tutti i record personali, comprese le checklist della spesa migrate o create localmente.

#### Recipes

Include:

- famiglie selezionate;
- versioni;
- ingredienti personali dipendenti;
- nessun calendario salvo richiesta esplicita.

#### Calendar

Include:

- giornate;
- override;
- aderenza;
- operazioni necessarie;
- riferimenti alle ricette.

### 9.2 Involucro

```json
{
  "recordType": "backup",
  "format": "tatadiet-backup",
  "schemaVersion": 1,
  "appVersion": "5.x",
  "exportedAt": "...",
  "baseDataset": {
    "id": "tatadiet-base-v1",
    "sourceSha256": "..."
  },
  "mode": "full",
  "data": {
    "ingredients": [],
    "ingredientRevisions": [],
    "recipes": [],
    "recipeVersions": [],
    "planInstances": [],
    "calendarDays": [],
    "operations": [],
    "shoppingChecklists": [],
    "settings": {}
  },
  "integrity": {
    "algorithm": "sha256",
    "digest": "..."
  }
}
```

### 9.3 Importazione sicura

Ordine obbligatorio:

1. lettura del file;
2. parsing JSON;
3. validazione dell'involucro;
4. verifica checksum;
5. validazione di ogni store;
6. verifica `baseDataset.id` e `baseDataset.sourceSha256`;
7. calcolo conflitti;
8. anteprima;
9. backup preventivo dei dati correnti;
10. transazione di import;
11. verifica finale;
12. possibilità di rollback.

### 9.4 Modalità di import

```text
sostituisci tutto
unisci
solo ricette e ingredienti
solo calendario
solo impostazioni
```

### 9.5 Conflitti di ID

- stesso ID e stesso contenuto: ignora duplicato;
- stesso ID e revisione più recente: mostra conflitto;
- stesso ID e contenuto differente importato: crea nuovo UUID e conserva un riferimento di provenienza importata;
- record base: non vengono sovrascritti;
- calendario con dataset base incompatibile: blocco o migrazione dedicata.

---

## 10. Migrazione dalla V4

La mappa completa è in `v5_audit/v4-to-v5-migration-map.json`.

### 10.1 Data iniziale

```text
localStorage: diet-plan:start-date:v2
-> IndexedDB settings.planStartDate
```

La data viene importata soltanto se è ISO valida.

### 10.2 Checklist

Pattern V4:

```text
diet-plan-shopping:*
diet-plan-shopping-range:*
```

Destinazione:

```text
shoppingChecklists
```

Le checklist statiche possono diventare obsolete dopo la modifica del piano. Devono quindi conservare:

- chiave di origine;
- data di migrazione;
- stato `legacy`;
- possibilità di eliminazione.

### 10.3 Export preferenze V4

Il formato:

```text
diet-plan-preferences, version 1
```

viene accettato soltanto per:

- data iniziale;
- checklist;
- preferenze riconosciute.

Non può contenere ricette o calendario V5.

### 10.4 Cache

Le cache PWA non sono dati personali e non vengono migrate. Il nuovo service worker gestirà autonomamente la propria versione.

---

## 11. Cronologia e annullamento

Lo schema è `$defs.operationRecord` in `schemas/v5/domain/tatadiet-v5.schema.json`.

Ogni modifica deve registrare:

- tipo;
- timestamp;
- data effettiva;
- payload;
- payload inverso;
- giornate coinvolte;
- stato applicato/annullato;
- descrizione leggibile.

Esempio:

```json
{
  "recordType": "operationRecord",
  "id": "usr:operation:insert-day-2026-10-14",
  "kind": "insert-day",
  "before": {},
  "after": {"date": "2026-10-14", "dayType": "OFF"}
}
```

Prima di una modifica estesa deve essere mostrato l'impatto:

- giornate spostate;
- pasti coinvolti;
- nuova data finale;
- spesa e preparazioni da ricalcolare.

---

## 12. Ricalcolo dei moduli derivati

### 12.1 Nutrienti giornalieri

Somma delle occorrenze effettive, con:

- versione effettiva;
- moltiplicatore di porzione;
- pasti rimossi esclusi;
- pasti aggiunti inclusi.

### 12.2 Spesa

La spesa viene aggregata dalle righe ingredienti delle versioni effettive.

Non deve più dipendere da `shopping-range.json` quando esistono modifiche personali.

### 12.3 Preparazioni 48 ore

Usa:

- data e ora civili;
- `dayOffset`;
- calendario effettivo;
- versioni effettive;
- meal-prep della versione.

La finestra resta:

```text
[istante corrente, istante corrente + 48 ore]
```

### 12.4 Ricerca

L'indice effettivo unisce:

- ricette base;
- ricette personali;
- ingredienti base;
- ingredienti personali;
- giornate effettive.

Può essere rigenerato in memoria o mantenuto con aggiornamenti incrementali.

### 12.5 ICS

Il file deve rappresentare il calendario effettivo, non la matrice originale.

---

## 13. Invarianti

Le fasi successive devono verificare automaticamente:

1. Gli ID sono univoci per store.
2. Un record base non viene modificato.
3. Ogni riga ricetta punta a un ingrediente esistente.
4. Ogni unità non base possiede una conversione.
5. Ogni occorrenza punta a una versione esistente.
6. Ogni giorno effettivo possiede una data civile univoca.
7. I pasti oltre mezzanotte conservano `dayOffset`.
8. Le operazioni estese sono transazionali.
9. Lo storico mantiene le versioni consumate.
10. Il backup completo è reimportabile senza perdita.
11. Un import fallito non modifica i dati esistenti.
12. La cancellazione della cache non cancella IndexedDB.
13. Il cambio di release non modifica il base dataset senza incremento di versione.
14. Spesa, preparazioni e nutrienti derivano dallo stesso piano effettivo.

---

## 14. Casi di test normativi

### 14.1 Ingrediente in grammi

```text
mozzarella: 250 kcal per 100 g
quantità: 80 g
risultato: 200 kcal
```

### 14.2 Ingrediente in millilitri

```text
latte: valori per 100 ml
quantità: 180 ml
fattore: 1,8
```

### 14.3 Conversione pezzo

```text
1 uovo = 50 g
quantità: 2 uova
basisAmount: 100 g
```

### 14.4 Porzioni

```text
totale ricetta: 1.120 kcal
porzioni: 2
per porzione: 560 kcal
```

### 14.5 Versionamento

- modifica di una ricetta personale crea una nuova versione;
- le occorrenze passate mantengono la versione precedente;
- le occorrenze future cambiano soltanto dopo conferma.

### 14.6 Giornata non seguita

- cambia lo stato di aderenza;
- non sposta la sequenza;
- non modifica retroattivamente la spesa già trascorsa.

### 14.7 Inserimento giornata

- crea una nuova istanza;
- sposta il futuro di un giorno;
- aggiorna la data finale;
- l'operazione è annullabile.

### 14.8 Import corrotto

- nessuna scrittura;
- messaggio di errore;
- dati locali invariati.

---

## 15. Non-obiettivi della Fase 1

Non sono inclusi in questa fase:

- implementazione IndexedDB;
- editor visivo ingrediente;
- editor ricetta;
- calendario modificabile;
- sincronizzazione cloud;
- foto personali;
- riconoscimento automatico di etichette;
- recupero automatico dei nutrienti da servizi esterni;
- bilanciatore automatico definitivo.

---

## 16. Gate per l'avvio della Fase 2

La Fase 2 può iniziare perché:

- il dataset base è congelato e dotato di hash;
- due generazioni consecutive del seed producono file byte-per-byte identici;
- il parsing è completo e riconcilia 3.189 righe su 3.189;
- il ricalcolo di 846 pasti resta entro uno scarto massimo di 0,05;
- le 5.308 formule del workbook hanno valori memorizzati e nessun errore;
- i nutrienti core sono completi;
- gli schemi base e di dominio sono stati prodotti;
- 8 esempi validi e 7 casi negativi superano il validatore Draft 2020-12;
- i riferimenti fra ingredienti, versioni, ricette e 864 occorrenze superano i contract test;
- la migrazione V4 è definita;
- i moduli che leggono dati statici sono inventariati senza duplicazioni;
- le lacune sono esplicite e non bloccanti.

La Fase 2 dovrà produrre:

```text
IndexedDB v1
repository dati locale
migrazione V4
backup/export/import
validazione e rollback
nessuna modifica ancora al calendario o alle ricette tramite UI
```


## 12. Stato dopo la Fase 5

Il piano effettivo è materializzato nei record `planInstance` e `calendarDay`; le operazioni sono registrate come `operationRecord`.

Invarianti implementati:

- il piano base non viene modificato;
- `not-followed` è aderenza e non sposta la sequenza;
- D1–D5, `OFF` e `CUSTOM` mantengono i pasti esistenti quando si cambia tipo;
- `FREE` svuota il menu della data senza spostare il futuro;
- `postpone-sequence` inserisce una giornata libera e sposta il futuro;
- `insert-day` e `remove-day` mantengono date civili consecutive e `sequenceIndex` continuo;
- i turni CUSTOM supportano `endDayOffset = 1`;
- ogni operazione produce patch `before`/`after` usate da undo/redo;
- una nuova operazione dopo undo elimina il ramo redo;
- un piano archiviato viene riattivato quando torna attiva la stessa data iniziale;
- `restore-from-date` preserva le modifiche strutturali precedenti alla data selezionata;
- backup `calendar` e `full` includono piano, giornate e operazioni.

Il Compositore e l'integrazione di Oggi, spesa, preparazioni, ricerca e ICS con il piano effettivo sono implementati nella 5.0.0.


## 13. Stato stabile 5.0.0

La release stabile mantiene `DB_VERSION = 1` e `SCHEMA_VERSION = 1`. `stableReleaseMigrationVersion = 5` registra il passaggio dalle alpha senza riscrivere i record personali.

Il resolver effettivo alimenta Home, Oggi, Preparazioni 48h, Spesa, Ricerca e ICS. I backup alpha V5 schema 1 e stesso dataset base sono importabili con warning di compatibilità.

Hardening PWA: cache core atomica, Planner/Compositore nella cache essenziale, fallback offline con `ignoreSearch` per URL con query e aggiornamento esplicito via `SKIP_WAITING`.
