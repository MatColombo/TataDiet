# TataDiet 5.2.1

TataDiet è una PWA statica e local-first per gestire un piano alimentare su turni. La release **5.2.1** è una patch compatibile con V5.2.0. Corregge il recupero del calendario personale nel riequilibrio e rende la pagina Oggi più compatta e coerente con le sigle G/N/SN/R1/R2/M/P.

## Patch 5.2.1

### Riequilibrio: recupero automatico del calendario personale

La pagina Preferenze non dipende più esclusivamente da `activePlanInstanceId`. Se la data iniziale è già configurata, TataDiet:

1. recupera un piano personale esistente anche se il riferimento attivo manca;
2. riattiva il piano corrispondente alla data iniziale;
3. se necessario materializza il piano effettivo dalla data già salvata;
4. apre normalmente il riequilibrio senza chiedere di configurare di nuovo il calendario.

La stessa logica di recupero è usata anche dalle viste del piano effettivo e dalla programmazione ricette.

### Oggi più compatto

La testata di `/oggi/` ora contiene soltanto:

```text
Versione V5.2.1 · piano alimentare di oggi
Oggi
```

La card del turno mostra in ordine:

- sigla UI colorata (`G`, `N`, `SN`, `R1`, `R2`, `M`, `P`);
- data descrittiva;
- nome completo del turno (`Turno giorno`, `Turno notte`, `Smonto`, ecc.);
- orario del turno, quando disponibile.

Il fallback statico usa le stesse sigle e non mostra D1/D2. Sono stati ridotti padding, titoli, distanze tra sezioni e spazio prima delle preparazioni 48h.

## Novità 5.2

### Riequilibra piano dalle Preferenze alimentari

Dopo aver impostato frequenze e limiti alimentari, la pagina `/preferenze/` può analizzare:

- prossima giornata;
- prossimi 7 giorni;
- prossimi 30 giorni;
- tutto il piano futuro.

Il motore considera il periodo nel suo insieme, i pasti bloccati, il tipo di turno, le preferenze alimentari e il profilo nutrizionale dei pasti. Prima di scrivere nel calendario mostra una preview completa; ogni sostituzione può essere selezionata o esclusa. Le modifiche confermate vengono salvate come **una singola operazione annullabile**.

### Programma una ricetta nel calendario

Da una ricetta base o personale è disponibile **Programma nel calendario**.

Percorso:

```text
/ricette/programma/
```

Si può scegliere quante volte inserire la ricetta e il periodo:

- prossimi 7 giorni;
- prossimi 30 giorni;
- resto del piano.

TataDiet propone date distinte e pasti compatibili, indica giorno/turno, pasto sostituito, nuova ricetta, porzione e scostamento nutrizionale. Prima della conferma si possono accettare tutte le proposte o solo alcune date. L'applicazione finale è atomica e supporta undo/redo.

### Navigazione semplificata

La navigazione principale non contiene più `Piano`.

Sono invece sempre disponibili:

```text
Oggi
Calendario
Ricette
Ingredienti / Alimenti
Spesa
Preferenze
Utilità
```

La sezione Piano resta raggiungibile dal fondo della pagina Calendario come archivio del programma base.

### Oggi riordinato

La pagina `/oggi/` segue ora questa gerarchia:

1. tipo di giornata;
2. prossimo pasto;
3. pasti nella data civile;
4. valori nutrizionali;
5. preparazioni nelle prossime 48 ore.

La precedente card “Calendario attivo” è stata rimossa.

### Spesa per date come vista principale

`/spesa/` apre direttamente la spesa per intervallo civile. Alla prima apertura calcola automaticamente **la spesa di oggi**.

Preset immediati:

- Oggi;
- Domani;
- Prossime 48 ore;
- Prossimi 5 giorni;
- Prossimi 7 giorni.

I preset compilano il date picker e aggiornano la lista nella stessa pagina. La card “Intervallo selezionato” viene mostrata sotto il selettore delle date. Le vecchie liste per ciclo/variante restano disponibili come collegamento secondario in fondo pagina.

## Funzioni V5.1 mantenute

### Tipi giornata

| Codice interno | Nome UI | Sigla | Colore |
|---|---|---|---|
| D1 | Giornata | G | ocra |
| D2 | Notte | N | blu intenso |
| D3 | Smonto | SN | azzurro |
| D4 | Riposo 1 | R1 | verde |
| D5 | Riposo 2 | R2 | verde |
| M | Mattino | M | giallo tuorlo |
| P | Pomeriggio | P | rosso intenso |

D1-D5 restano codici interni per compatibilità. `M` e `P` usano il profilo dietistico di Giornata; non introducono orari di turno inventati.

### Gestisci giornata

`/calendario/gestisci/` resta il flusso consigliato per modifiche rapide: tipo giorno, menu adattato/mantenuto/personalizzato, aderenza, giornata libera, inserimento/rimozione/posticipo e conferma finale unica.

### Preferenze alimentari

Supportate:

- Uova;
- Latte e yogurt;
- Formaggi;
- Affettati;
- Pesce;
- Legumi;
- Carne rossa.

Livelli:

```text
Più spesso
Normale
Meno spesso
Raramente
Mai
```

Ogni famiglia può avere anche un massimo di occasioni ogni 7 giorni. Una occasione corrisponde a un pasto. Queste preferenze influenzano le proposte automatiche ma non impediscono la scelta manuale di una ricetta.

## Architettura

```text
Dataset base immutabile
+ IndexedDB personale
+ calendario effettivo
+ ricette/versioni assegnate
+ porzioni
+ preferenze alimentari
+ riequilibrio / programmazione ricette
= piano effettivo
```

Database e schema restano compatibili:

```text
tatadiet-v5
DB_VERSION = 1
SCHEMA_VERSION = 1
```

La V5.2 non richiede una migrazione distruttiva della V5.0/V5.1.

## Percorsi principali

```text
/oggi/
/calendario/
/calendario/gestisci/
/calendario/modifica/
/calendario/componi/
/preferenze/
/preparazioni/
/ingredienti/
/ricette/
/ricette/studio/
/ricette/programma/
/spesa/
/spesa/cicli/
/cerca/
/strumenti/
```

## Build e QA

Non modificare manualmente `docs/`.

```bash
./build.sh
./v5_2.sh
```

`./qa.sh` richiama il gate V5.2.

QA browser contro un deploy:

```bash
python3 scripts/qa_v5_2.py --base-url https://MatColombo.github.io/TataDiet
```

## Gate finale 5.2.1

```text
592 pagine HTML
44.713 link/risorse/frammenti
0 errori
0 warning
650 risorse offline
17.120.878 byte offline
```

Accessibilità statica:

```text
592 pagine
1.187 immagini
2.220 pulsanti
21.033 link
2.217 controlli form
0 errori
0 warning
```

Stress del calendario: 96 operazioni consecutive con undo e redo completi.

QA Chromium end-to-end: **23/23 controlli V5.2 superati**. La patch aggiunge inoltre un test dedicato al recupero del calendario con `activePlanInstanceId` mancante e alla resa compatta/colorata della card Oggi.

## Pubblicazione GitHub Pages

```text
Settings → Pages
Deploy from a branch
Branch: main
Folder: /docs
```

## Persistenza e privacy

TataDiet non richiede account o backend. Ingredienti, ricette, preferenze, calendario, cronologia e modifiche restano nel browser. Per trasferire i dati usare **Utilità → Backup JSON**.

## Limiti

- La sincronizzazione fra dispositivi resta manuale tramite export/import JSON.
- Il riequilibrio è un supporto di pianificazione e non sostituisce indicazioni cliniche o prescrizioni nutrizionali.
- La programmazione casuale è deterministica rispetto al seed interno della proposta e privilegia compatibilità e vicinanza nutrizionale; l'utente conferma sempre le sostituzioni.
- La prova standalone su hardware iOS/Android reale resta raccomandata dopo il deploy.
