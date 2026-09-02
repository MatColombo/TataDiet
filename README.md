# TataDiet 5.1.0

TataDiet è una PWA statica e local-first per gestire un piano alimentare su turni. La release **5.1.0** mantiene l'architettura dati stabile della V5 e migliora soprattutto la gestione quotidiana del calendario, la nomenclatura dei turni e la libertà nelle proposte alimentari.

## Novità 5.1

### Nomi delle giornate

I codici storici D1-D5 restano soltanto nel dataset interno per compatibilità. Nell'interfaccia vengono mostrati:

| Codice interno | Nome UI | Sigla | Colore |
|---|---|---|---|
| D1 | Giornata | G | ocra |
| D2 | Notte | N | blu intenso |
| D3 | Smonto | SN | azzurro |
| D4 | Riposo 1 | R1 | verde |
| D5 | Riposo 2 | R2 | verde |
| M | Mattino | M | giallo tuorlo |
| P | Pomeriggio | P | rosso intenso |

`M` e `P` sono nuovi tipi reali di calendario. Dal punto di vista dietistico usano lo stesso profilo di **Giornata**. Non viene inventato un orario fisso di turno; per orari precisi resta disponibile il turno personalizzato.

### Gestisci giornata

Nuovo percorso principale:

```text
/calendario/gestisci/
```

Da una sola schermata è possibile:

- percorrere rapidamente il calendario mensile;
- scegliere G, N, SN, R1, R2, M o P;
- mantenere il menu, adattarlo automaticamente o personalizzare singoli piatti;
- cambiare l'aderenza;
- rendere la giornata libera;
- posticipare il piano;
- inserire o eliminare una giornata;
- vedere l'impatto prima di applicare;
- confermare tutto con una singola operazione, quindi con un solo passo undo/redo.

Quando cambia il tipo di giornata, **Adatta menu** diventa automaticamente l'opzione proposta.

La precedente pagina `/calendario/modifica/` resta disponibile come **Gestione avanzata** per casi come turni CUSTOM.

### Preferenze alimentari

Nuova pagina:

```text
/preferenze/
```

Le proposte automatiche possono essere regolate per:

- Uova;
- Latte e yogurt;
- Formaggi;
- Affettati;
- Pesce;
- Legumi;
- Carne rossa.

Per ogni famiglia si può scegliere:

```text
Più spesso
Normale
Meno spesso
Raramente
Mai
```

È inoltre possibile impostare un massimo di occasioni in 7 giorni. Una occasione corrisponde a un **pasto** contenente quella famiglia alimentare.

Queste sono preferenze di ranking, non vincoli clinici: `Mai` esclude una famiglia dalle proposte automatiche, ma una ricetta resta selezionabile manualmente. Le preferenze sono salvate in IndexedDB e incluse nei backup JSON `full` e `settings`.

Il motore classifica le ricette usando i nomi reali degli ingredienti della versione ricetta, non soltanto il titolo del piatto.

## Funzioni V5 mantenute

- 6 cicli, 36 varianti, 180 giorni base e 864 occorrenze pasto.
- 130 ingredienti base e ingredienti personali versionati.
- 306 famiglie di ricette base e 547 versioni effettive; ricette personali con ricalcolo nutrizionale.
- Piano personale in IndexedDB con aderenza, FREE, OFF, CUSTOM, inserimento/rimozione/posticipo e undo/redo.
- Compositore pasti con ricette base/personali, porzioni, blocco pasti e suggerimenti locali.
- Resolver unico del piano effettivo per Home, Oggi, Preparazioni 48h, Spesa, Ricerca e ICS.
- Backup JSON con checksum, import, merge e rollback.
- PWA installabile e libreria offline.

## Architettura

```text
Dataset base immutabile
+ IndexedDB personale
+ calendario effettivo
+ ricette/versioni assegnate
+ porzioni
+ preferenze alimentari
= piano effettivo
```

Database:

```text
tatadiet-v5
DB_VERSION = 1
SCHEMA_VERSION = 1
```

La V5.1 non richiede una migrazione distruttiva del database. I piani, ingredienti e ricette creati nella V5.0 rimangono validi.

## Percorsi principali

```text
/oggi/
/calendario/
/calendario/gestisci/      gestione quotidiana consigliata
/calendario/modifica/      gestione avanzata
/calendario/componi/       compositore completo
/preferenze/               frequenze alimentari
/preparazioni/
/ingredienti/
/ricette/
/ricette/studio/
/spesa/intervallo/
/cerca/
/strumenti/
```

## Sorgenti e build

```text
source_data/        PDF/XLSX di origine
static/             CSS, JavaScript, PWA, icone
scripts/            build, test e QA
templates/          template Jinja2
schemas/v5/         JSON Schema
v5_data/base/       dataset base immutabile
docs/               sito generato
qa/                 report e screenshot
```

Non modificare manualmente `docs/`.

Build:

```bash
./build.sh
```

Gate completo V5.1:

```bash
./v5_1.sh
```

oppure:

```bash
./qa.sh
```

QA browser:

```bash
python3 scripts/qa_v5_1.py --base-url https://MatColombo.github.io/TataDiet
```

## Pubblicazione GitHub Pages

```text
Settings → Pages
Deploy from a branch
Branch: main
Folder: /docs
```

## Persistenza e privacy

TataDiet non richiede account o backend. Ingredienti, ricette, piano personale, cronologia e preferenze restano nell'origine browser. Per trasferirli usare **Utilità → Backup JSON**.

## Limiti

- `M` e `P` non introducono orari di turno predefiniti: il requisito fornito definisce il tipo di giornata e il profilo alimentare, non gli orari esatti.
- Le preferenze alimentari influenzano i suggerimenti automatici ma non sostituiscono allergie, diagnosi o indicazioni cliniche.
- La sincronizzazione tra dispositivi resta manuale tramite export/import JSON.
- L'installazione standalone va comunque verificata su iOS/Android reali dopo il deploy.
