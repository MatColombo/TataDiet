# TataDiet — memoria tecnica canonica

## Stato corrente

- Versione stabile: **5.0.0**
- Data release: **26 agosto 2026**
- Distribuzione: sito statico/PWA da `docs/`, compatibile con GitHub Pages project site
- Persistenza personale: IndexedDB `tatadiet-v5`
- DB version: 1
- Schema domain/backup: 1
- Dataset base: `tatadiet-base-v1`
- Fonte alimentare autorevole: `source_data/Piano_alimentare_revisionato_6_mesi_fibra_moderata.xlsx`
- Il repository non deve contenere identificatori personali o profili sanitari nominativi. I vincoli alimentari necessari sono codificati nel dataset e nella logica del prodotto.

## Conteggi base verificati

| Oggetto | Quantità |
|---|---:|
| Cicli | 6 |
| Varianti | 36 |
| Giorni base | 180 |
| Pasti/spuntini base | 864 |
| Famiglie ricetta | 306 |
| Versioni ricetta base | 547 |
| Ingredienti base | 130 |
| Ingredienti usati dal piano | 100 |
| HTML generati | 588 |
| Link/risorse/frammenti verificati | 38.259 |
| Risorse libreria offline | 639 |

## Principio architetturale

```text
BASE IMMUTABILE
+ DATI PERSONALI INDEXEDDB
+ CALENDARIO EFFETTIVO
+ VERSIONI RICETTA ASSEGNATE
+ PORZIONI DELLE OCCORRENZE
= PIANO EFFETTIVO
```

Il dataset base non viene modificato dal browser. Tutte le personalizzazioni sono locali e possono essere esportate in JSON.

## Fonti autorevoli del repository

```text
source_data/        dati alimentari di origine
static/             CSS, JS, manifest, SW, icone, illustrazioni
templates/          template Jinja2
scripts/            build, validatori e test
schemas/v5/         JSON Schema
spec/v5/            esempi di contratto
v5_data/base/       seed immutabile
docs/               output generato
qa/                 report e screenshot
```

Non modificare manualmente `docs/`.

## IndexedDB

Store:

```text
meta
settings
ingredients
ingredientRevisions
recipes
recipeVersions
planInstances
calendarDays
operations
shoppingChecklists
```

Regole:

- record `origin=base`/`immutable=true` non modificabili;
- ingredienti personali hanno revisioni immutabili;
- ricette personali hanno versioni immutabili;
- ogni riga ricetta conserva l'esatto `ingredientRevisionId`;
- ogni pasto effettivo conserva l'esatto `recipeVersionId` e `portionMultiplier`;
- lo storico non viene ricalcolato silenziosamente quando cambia una revisione/versione.

## Ingredienti personali

L'utente può creare/duplicare ingredienti con:

- nome, categoria, marca/alias;
- base per 100 g o 100 ml;
- kcal, proteine, carboidrati, grassi, fibra;
- zuccheri, saturi, sale, sodio facoltativi;
- stato alimento;
- fonte e note;
- conversioni pratiche (`pezzo`, `vasetto`, `fetta`, unità personalizzate).

Una modifica crea una nuova revisione. Eliminazione consentita solo se non referenziato.

## Ricette personali

- le 306 ricette base sono immutabili;
- una base può essere duplicata come personale;
- una ricetta personale può essere creata da zero;
- kcal/macro/fibra sono ricalcolati da ingredienti e quantità;
- le porzioni dividono il totale nutrizionale;
- ogni modifica crea una nuova versione;
- archiviazione conserva lo storico;
- eliminazione bloccata se il piano contiene riferimenti.

## Planner personale

Tipi giorno:

```text
D1 D2 D3 D4 D5 CUSTOM OFF FREE
```

Aderenza:

```text
planned followed partial not-followed not-applicable
```

Semantica consolidata:

- `not-followed` registra aderenza e non sposta il piano;
- D1-D5/OFF/CUSTOM possono sostituire il tipo mantenendo il menu;
- `FREE` mantiene la data ma svuota i pasti;
- `postpone-sequence` inserisce FREE e sposta il futuro;
- `insert-day` prolunga la sequenza;
- `remove-day` anticipa il futuro;
- CUSTOM supporta turni oltre mezzanotte;
- ogni operazione produce patch before/after;
- undo/redo è persistente;
- una nuova modifica dopo undo elimina il ramo redo;
- tornando a una data iniziale già usata viene riattivato il piano personale precedente.

## Compositore giornata

Permette di:

- mantenere/sostituire/rimuovere/aggiungere pasti;
- cambiare orario, tipo e porzione;
- scegliere ricette base o personali;
- bloccare pasti da preservare;
- caricare un menu da uno dei 180 giorni base;
- filtrare per origine, freddo, rapidità, fibra moderata e assenza di riscaldamento;
- generare suggerimenti deterministici locali;
- ricalcolare nutrienti della giornata.

I suggerimenti non modificano il piano senza conferma.

## Resolver del piano effettivo

Home, Oggi, Preparazioni 48h, Spesa, Ricerca e ICS leggono lo stesso piano personale.

La spesa viene ricostruita dalle righe ingrediente della versione ricetta effettiva, scalate per porzione. I pasti oltre mezzanotte appartengono alla data civile di consumo.

La finestra Preparazioni resta mobile e inclusiva fino a +48 ore, visualizzata come 0–24 e 24–48.

## Backup

Formati:

```text
full
recipes
calendar
settings
```

Ogni envelope contiene `format=tatadiet-backup`, schema 1, appVersion, dataset base, SHA-256 e dati personali.

Import:

1. parse;
2. validazione forma;
3. verifica checksum;
4. verifica dataset base;
5. rilevamento conflitti;
6. anteprima;
7. checkpoint preventivo;
8. transazione;
9. possibilità di rollback.

Backup alpha V5 schema 1 con lo stesso dataset base sono compatibili con 5.0.0 e producono un warning, non un errore.

## Migrazione stabile

`stableReleaseMigrationVersion = 5`.

La stabile usa ancora DB schema 1. Dopo le normalizzazioni base di ingredienti/ricette, la migrazione finale aggiorna solo i marker `meta` e **non riscrive i record personali**.

QA verificata con record personali creati prima del downgrade simulato dei marker alpha e confronto degli ID prima/dopo.

## PWA/offline

- service worker scope-safe per GitHub Pages project path;
- cache core versionata;
- installazione core atomica: una risorsa mancante annulla l'installazione del nuovo worker;
- Planner e Compositore inclusi nella cache core;
- navigazioni offline con query usano match `ignoreSearch`;
- libreria completa offline facoltativa;
- PDF/XLSX pesanti esclusi dal pack;
- aggiornamento esplicito tramite worker waiting + `SKIP_WAITING`;
- `controllerchange` ricarica la pagina;
- IndexedDB non viene toccato dalla pulizia cache o dall'upgrade SW.

## QA stabile 5.0.0

Validazione deterministica:

```text
588 HTML
38.259 link/risorse/frammenti
0 errori
0 warning
639 risorse offline
```

Accessibilità statica:

```text
588 pagine
1.179 immagini
2.172 pulsanti
18.855 link
2.196 controlli form
0 errori
0 warning
```

Stress calendario:

```text
96 operazioni miste
stato valido dopo ogni operazione
undo completo = stato iniziale
redo completo = stato finale
```

QA browser Chromium:

- migrazione alpha→stabile senza perdita dati;
- backup stable e alpha compatibile;
- import replace e rollback;
- service worker sotto `/docs/`;
- Planner/Compositore offline con query;
- offline pack 639/639, 0 failure;
- ricetta profonda offline;
- update worker waiting/activate;
- IndexedDB preservato;
- nessun overflow sulle viste principali a 390 px;
- nessun pageerror.

Limite: non è stata eseguita una prova fisica standalone su iOS/Android reale; farla dopo il deploy pubblico.

## Build e gate

```bash
./build.sh
./phase8.sh
# equivalente
./qa.sh
```

QA browser:

```bash
python3 scripts/qa_v5_phase8.py --base-url <URL-pubblicata>
```

## Pubblicazione

GitHub Pages:

```text
branch main
folder /docs
```

Percorsi relativi; compatibile con `https://<utente>.github.io/<repo>/`.

## Backlog post-V5

Non fa parte della 5.0.0:

- sincronizzazione cloud/account;
- preferiti e note personali avanzate;
- dispensa personale;
- batch cooking avanzato;
- sostituzioni equivalenti interattive più evolute.

Qualunque V6 deve partire da questa memoria e non rompere schema backup/IndexedDB senza una migrazione esplicita e testata.
