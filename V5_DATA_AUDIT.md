# TataDiet V5 - Audit dei dati della Fase 1

**Stato:** superato con lacune documentate  
**Versione di fase:** `5.0.0-alpha.1-phase1`  
**Dataset base congelato:** `tatadiet-base-v1`  
**Fonte autorevole:** `source_data/Piano_alimentare_revisionato_6_mesi_fibra_moderata.xlsx`

## 1. Esito sintetico

La struttura esistente è sufficientemente coerente per costruire l'editor di ingredienti e ricette della V5 senza ricreare manualmente il piano.

| Controllo | Esito |
|---|---:|
| Ingredienti nel catalogo nutrizionale | 130 |
| Ingredienti effettivamente usati nel piano | 100 |
| Ingredienti disponibili ma non usati | 30 |
| Giorni | 180 |
| Pasti e spuntini | 864 |
| Pasti con composizione ingredienti strutturabile | 846 |
| Pasti flessibili con sola stima nutrizionale | 18 |
| Righe ingrediente nei pasti | 3.189 |
| Righe consolidate ingrediente-giorno | 2.735 |
| Famiglie di ricette | 306 |
| Versioni di ricetta distinte | 547 |
| Famiglie con più di una versione | 90 |

## 2. Controlli superati

### 2.1 Catalogo ingredienti

Tutti i 130 ingredienti hanno i valori core richiesti:

- energia;
- proteine;
- carboidrati;
- grassi;
- fibra.

Non sono presenti:

- codici duplicati;
- nomi canonici duplicati;
- ingredienti usati nel piano ma assenti dal catalogo;
- conflitti di unità tra catalogo e dettaglio del piano.

Le basi nutrizionali esistenti sono:

- 127 ingredienti per 100 g;
- 3 ingredienti per circa 100 ml.

### 2.2 Parsing degli ingredienti dei pasti

Tutte le stringhe degli 846 pasti ordinari sono state trasformate in righe strutturate.

Esempio:

```text
riso basmati secco 55 g;
petto di pollo 110 g;
finocchi 150 g (ben cotti);
feta 35 g;
olio extravergine di oliva 4 g
```

Diventa:

```json
[
  {
    "ingredient_id": "base:ingredient:riso_basmati",
    "ingredient_revision_id": "base:ingredient-revision:riso_basmati@1",
    "quantity": 55,
    "unit": "g",
    "base_quantity": 55,
    "base_unit": "g"
  },
  {
    "ingredient_id": "base:ingredient:pollo",
    "ingredient_revision_id": "base:ingredient-revision:pollo@1",
    "quantity": 110,
    "unit": "g",
    "base_quantity": 110,
    "base_unit": "g"
  }
]
```

Sono state necessarie soltanto tre equivalenze lessicali:

- `uovo` -> ingrediente canonico `uovo intero`;
- `spinaci ben cotti` -> `spinaci`;
- `banana matura` -> `banana`.

Per l'uovo viene conservata la conversione già implicita nel workbook:

```text
1 uovo = circa 50 g edibili
```

### 2.3 Riconciliazione con la spesa

Le 3.189 righe ottenute dal parsing dei singoli pasti sono state aggregate per giorno e confrontate con il foglio `Dettaglio ingredienti`.

Risultato:

```text
180 giorni riconciliati su 180
0 differenze di quantità
0 differenze di unità
```

Questo dimostra che le liste della spesa future possono essere ricalcolate dalle ricette effettive, senza dipendere dalle liste statiche del workbook.

### 2.4 Ricalcolo nutrizionale

Per ogni pasto strutturato è stata applicata la formula:

```text
quantità base / 100 × nutriente dell'ingrediente per 100 g o 100 ml
```

Risultato:

```text
846 pasti strutturati coerenti su 846
0 discrepanze oltre la precisione di visualizzazione a una cifra decimale
```

I valori del workbook possono quindi essere riprodotti dal catalogo ingredienti.

## 3. Risultato importante: ricetta e versione non coincidono

Il piano contiene 306 titoli di ricetta, ma 547 composizioni distinte.

Per esempio, uno stesso titolo può essere usato con:

- quantità differenti;
- frutta differente;
- pane bianco o di segale;
- riso basmati o integrale;
- ingredienti aggiuntivi per raggiungere il target giornaliero.

Sono 90 le famiglie che possiedono più di una versione. Alcune arrivano a nove versioni.

Di conseguenza, nella V5:

```text
Titolo ricetta != composizione nutrizionale
```

Il modello deve separare:

```text
recipe family
    -> recipe version 1
    -> recipe version 2
    -> recipe version 3
```

Una giornata deve puntare sempre a una versione specifica.

Per ogni famiglia base viene inoltre calcolato un `default_version_id` deterministico: la versione con il maggior numero di occorrenze; in caso di parità prevale l'ID lessicograficamente minore. Questo valore serve soltanto alla consultazione della libreria. Le giornate continuano a puntare alla propria versione esatta.

Ogni ingrediente base espone un `revision_id` immutabile e ogni riga ricetta conserva `ingredient_revision_id`. Questo impedisce che un futuro aggiornamento nutrizionale modifichi retroattivamente una ricetta o uno storico già registrato.

## 4. Lacune documentate

### 4.1 Stato dell'alimento

Solo 26 ingredienti dichiarano o permettono di inferire chiaramente termini come:

- secco;
- cotto;
- sgocciolato;
- crudo;
- preparato/arrostito.

Per 104 ingredienti lo stato non è esplicito.

Decisione:

- il base dataset conserva `food_state=unspecified` quando non dichiarato;
- non vengono inventati stati durante l'importazione;
- per gli ingredienti personali il campo viene richiesto quando modifica il significato nutrizionale, per esempio riso crudo/cotto o legume secco/cotto.

### 4.2 Provenienza nutrizionale

Il workbook contiene fonti generali, ma non collega ogni singolo ingrediente a una specifica voce CREA o a una specifica etichetta.

Tutti i 130 record base sono quindi marcati:

```text
provenance.granularity = dataset_level
```

Per i nuovi ingredienti personali saranno disponibili:

- etichetta del prodotto;
- banca dati;
- stima manuale;
- importazione.

### 4.3 Nutrienti opzionali

Il workbook non contiene:

- zuccheri;
- grassi saturi;
- sale;
- sodio.

Questi campi sono previsti nello schema ma non sono obbligatori per il motore core della V5.

### 4.4 Istruzioni delle ricette

Le ricette base contengono:

- ingredienti;
- quantità;
- tempo;
- cucina;
- meal prep;
- conservazione;
- note pratiche.

Non contengono passaggi di preparazione strutturati. Tutte le 306 famiglie vengono quindi marcate:

```text
instructions_status = missing
```

Le ricette personali potranno includere passaggi numerati.

### 4.5 Porzioni implicite

Il workbook non ha un campo esplicito per il numero di porzioni. Ogni pasto è destinato a una persona ed è stato congelato con:

```text
servings = 1
servings_source = inferred_single_person_meal
```

Per una nuova ricetta il numero di porzioni sarà obbligatorio.

### 4.6 Pasti flessibili

I 18 pasti flessibili hanno calorie e macronutrienti stimati, ma non una lista ingredienti quantitativa.

Sono marcati:

```text
composition_status = unstructured_estimate
nutrition.mode = manual_estimate
editable_ingredient_composition = false
```

Per personalizzarli l'utente potrà:

1. duplicarli;
2. inserire una composizione completa;
3. oppure creare una nuova stima manuale esplicitamente segnalata.

## 5. Integrità del workbook e riproducibilità

### 5.1 Formule Excel

Sono state controllate tutte le celle formula leggendo sia le espressioni sia i valori memorizzati nel file:

```text
Formule totali: 5.308
Valori memorizzati mancanti: 0
Errori Excel memorizzati: 0
```

Il controllo è parte del gate della fase: una formula senza valore memorizzato o con errore blocca la generazione del seed.

### 5.2 Seed deterministico

I file base usano il timestamp stabile della fonte Excel, non l'ora di esecuzione dell'audit. `phase1.sh` genera il seed due volte e confronta gli hash SHA-256. Il gate passa soltanto quando i quattro file risultano byte-per-byte identici.

### 5.3 Schemi e contract test

Sono verificati:

- 4 schemi per il dataset base;
- 1 schema di dominio Draft 2020-12;
- 8 esempi validi;
- 7 esempi volutamente non validi;
- riferimenti tra ingredienti, revisioni, famiglie, versioni, giornate e pasti;
- gestione della coda D2 tramite `day_offset=1`.

## 6. Dataset base congelato

La Fase 1 produce quattro file immutabili:

```text
v5_data/base/ingredients.base.v1.json
v5_data/base/recipes.base.v1.json
v5_data/base/plan-template.base.v1.json
v5_data/base/base-dataset-manifest.json
```

Il manifest contiene:

- versione del dataset;
- hash SHA-256 delle fonti;
- hash SHA-256 di ogni snapshot;
- conteggi attesi;
- invarianti di immutabilità.

Le modifiche dell'utente non dovranno mai essere scritte in questi file.

Gli snapshot usano un formato di trasporto `snake_case` validato da `schemas/v5/base/`. Il modello locale normalizzato, separato in identità e revisioni/versioni, è definito da `schemas/v5/domain/tatadiet-v5.schema.json`. L'adattatore tra i due livelli verrà implementato nella Fase 2.

## 7. Dipendenze V4 da sostituire nelle fasi successive

Attualmente alcuni moduli leggono direttamente JSON statici:

| Modulo | Dataset |
|---|---|
| Calendario | `calendar.json` |
| Oggi | dati calendario statici |
| Preparazioni | `calendar.json` |
| Spesa per intervallo | `calendar.json`, `shopping-range.json` |
| Ricerca | `search-index.json` |
| Strumenti/ICS | `calendar.json` |
| Service worker | tutti i dataset statici principali |

Nella V5 questi moduli dovranno leggere un unico livello applicativo:

```text
EffectivePlanRepository
```

che combina:

```text
base immutabile
+ dati personali IndexedDB
+ override delle occorrenze
+ calendario effettivo
```

## 8. Gate della Fase 1

La fase è considerata completata perché sono vere tutte le seguenti condizioni:

- 130 ingredienti catalogati;
- 180 giorni presenti;
- 864 pasti presenti;
- 3.189 righe ingrediente parse;
- nessun token non riconosciuto;
- nessun ingrediente usato senza record nutrizionale;
- riconciliazione esatta per tutti i giorni;
- 846 ricalcoli nutrizionali coerenti;
- 306 famiglie e 547 versioni congelate;
- schemi JSON base e di dominio prodotti;
- 5.308 formule verificate senza cache mancanti o errori;
- seed base rigenerato due volte con hash identici;
- 8 esempi positivi e 7 negativi validati;
- contract test su tutti i riferimenti del seed superati;
- migrazione V4 documentata;
- dipendenze statiche inventariate.

I risultati completi sono disponibili in:

```text
v5_audit/audit-summary.json
v5_audit/ingredient-audit.csv
v5_audit/recipe-version-audit.csv
v5_audit/static-data-dependency-map.json
v5_audit/v4-to-v5-migration-map.json
```
