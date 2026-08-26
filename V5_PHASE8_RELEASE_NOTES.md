# TataDiet 5.0.0 — Release stabile

**Data:** 26 agosto 2026  
**Versione:** `5.0.0`  
**Database:** `tatadiet-v5`, schema 1

## Obiettivo

La Fase 8 chiude la linea V5 senza aggiungere nuove funzioni di prodotto. Il lavoro è concentrato su hardening, migrazione, accessibilità, offline/update PWA, stress test e consolidamento della documentazione.

## Correzioni e hardening

- tutti i dataset e gli HTML generati convergono su `5.0.0`;
- i backup nuovi dichiarano `appVersion = 5.0.0`;
- backup alpha V5 schema 1 con lo stesso dataset base restano importabili con warning esplicito;
- migrazione stabile non distruttiva tramite `stableReleaseMigrationVersion = 5`;
- cache core PWA resa atomica: un'installazione incompleta viene annullata;
- cache core ampliata a Planner, Compositore e tutti i JavaScript globali;
- fallback offline delle navigazioni tollera i parametri query tramite `ignoreSearch`;
- fallback 503 esplicito se una pagina non è realmente disponibile offline;
- corretto il filtro Compatibilità mancante nel template del Compositore;
- aggiunto nome accessibile al campo nota dinamico nello Studio ricette;
- rimossi badge alpha/fase dalla UI pubblica;
- corretto il banner calendario che descriveva la sincronizzazione come futura.

## Migrazione

La 5.0.0 mantiene `DB_VERSION = 1` e `SCHEMA_VERSION = 1`. Non viene eseguita una riscrittura dei dati personali creati dalle alpha. Gli ID di ingredienti, ricette, piani e operazioni rimangono invariati.

La QA browser ha simulato un'installazione proveniente da `5.0.0-alpha.7-phase7`, forzando i marker di migrazione precedenti e verificando che tutti i record personali rimanessero identici dopo `TataDietDB.initialize()`.

## Accessibilità

Audit statico su tutte le pagine generate:

- lingua documento e viewport;
- skip link;
- un H1 per pagina;
- ID univoci;
- `alt` su tutte le immagini;
- nome accessibile per link e pulsanti;
- label/ARIA sui controlli form;
- nessun tabindex positivo;
- gerarchia heading senza salti.

Esito: 0 errori, 0 warning.

## PWA/offline

Verificato su un deployment locale sotto `/docs/`, equivalente a un GitHub Pages project path:

- scope del service worker corretto;
- Planner e Compositore disponibili offline con query string;
- pacchetto offline completo 639/639 risorse, 0 fallimenti;
- apertura offline di una ricetta non appartenente alla cache core;
- nuovo service worker in stato waiting;
- attivazione tramite `SKIP_WAITING`;
- reload controllato;
- IndexedDB invariato dopo l'aggiornamento.

## Backup

Verificati:

- backup `full` stabile;
- compatibilità di un envelope alpha V5;
- checksum;
- import `replace`;
- round-trip;
- rollback allo stato precedente;
- ripristino finale del contenuto originale.

## Stress calendario

96 operazioni miste su un piano di 180 giorni, con modifiche di aderenza, tipo giorno, FREE, CUSTOM, inserimenti e rimozioni. Verificati dopo ogni operazione:

- date civili consecutive;
- ID univoci;
- `sequenceIndex` continuo;
- stato valido;
- undo completo fino allo stato iniziale;
- redo completo fino allo stato finale.

## QA browser

La QA finale `scripts/qa_v5_phase8.py` verifica:

- versione stabile e UI senza alpha;
- navigazione tastiera/skip link;
- creazione dati personali rappresentativi;
- migrazione alpha→stabile;
- backup/import/rollback;
- PWA sotto project path;
- offline core e full pack;
- aggiornamento service worker;
- persistenza IndexedDB;
- viewport mobile 390×844 senza overflow;
- assenza di errori JavaScript di pagina.

## Limite di ambiente

Non è stata eseguita una prova fisica su iPhone/iPad o Android reale. Il comportamento PWA, offline e responsive è stato verificato con Chromium reale e viewport mobile. La verifica standalone su hardware reale resta una prova manuale post-deploy, non modifica il contenuto della release 5.0.0.
