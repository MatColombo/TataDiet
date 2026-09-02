# TataDiet V5 - Matrice di test

**Ambito:** specifica dati, migrazione, persistenza e funzionalità previste per V5.  
**Stato:** definita nella Fase 1; implementazione progressiva nelle Fasi 2-8.

## 1. Audit e seed base

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| SEED-001 | Caricare l'Excel autorevole | 15 fogli leggibili, SHA atteso | 1 |
| SEED-002 | Leggere catalogo ingredienti | 130 codici e nomi univoci | 1 |
| SEED-003 | Contare pasti | 180 giorni, 864 pasti | 1 |
| SEED-004 | Allineare token e dettaglio | 3.189 su 3.189, zero errori | 1 |
| SEED-005 | Convertire uova | N uova = N × 50 g | 1 |
| SEED-006 | Ricalcolare nutrienti | scarto massimo 0,051 | 1 |
| SEED-007 | Deduplicare formulazioni | 306 identità, 547 versioni | 1 |
| SEED-008 | Migrare pasti flessibili | 18 versioni manuali | 2 |
| SEED-009 | Codice dettaglio assente | build bloccata | 2 |
| SEED-010 | Quantità diversa dal testo | build bloccata | 2 |
| SEED-011 | Verificare formule e cache Excel | 5.308 formule, zero cache mancanti, zero errori | 1 |
| SEED-012 | Generare il seed due volte | hash identici per tutti i file base | 1 |
| SEED-013 | Validare esempi schema positivi | 8 record accettati | 1 |
| SEED-014 | Validare casi schema negativi | almeno 7 record rifiutati | 1 |
| SEED-015 | Verificare riferimenti del seed | zero ID orfani fra 130 ingredienti, 547 versioni e 864 pasti | 1 |

## 2. Ingredienti

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| ING-001 | Creare ingrediente per 100 g | record e revisione 1 validi | 3 |
| ING-002 | Creare ingrediente per 100 ml | calcolo su ml corretto | 3 |
| ING-003 | Aggiungere unità “vasetto” | conversione verso la base | 3 |
| ING-004 | Aggiungere unità “uovo” | quantità normalizzata corretta | 3 |
| ING-005 | Nutriente negativo | salvataggio bloccato | 3 |
| ING-006 | Nutriente obbligatorio vuoto | salvataggio bloccato | 3 |
| ING-007 | Dati 4/4/9 anomali | avviso, non blocco | 3 |
| ING-008 | Nome simile a base esistente | suggerimento duplicato | 3 |
| ING-009 | Modificare ingrediente usato | nuova revisione | 3 |
| ING-010 | Ricetta storica dopo revisione | resta sulla revisione precedente | 3 |
| ING-011 | Archiviare ingrediente usato | nascosto dai nuovi inserimenti, riferimenti validi | 3 |
| ING-012 | Eliminare ingrediente usato | operazione bloccata | 3 |
| ING-013 | Importare ingrediente con stesso ID/contenuto | deduplicato | 2-3 |
| ING-014 | Importare stesso ID/contenuto diverso | rimappato in namespace `imp:` | 2-3 |

## 3. Ricette e calcolo

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| REC-001 | Creare ricetta da ingredienti base | calcolo completo | 4 |
| REC-002 | Usare ingrediente personale | calcolo completo | 4 |
| REC-003 | Mescolare g e ml | calcolo coerente con ogni base | 4 |
| REC-004 | Usare unità personale | normalizzazione corretta | 4 |
| REC-005 | Cambiare porzioni da 1 a 2 | valori per porzione dimezzati | 4 |
| REC-006 | Moltiplicatore pasto 1,5 | nutrienti occorrenza × 1,5 | 4 |
| REC-007 | Ingrediente senza dati | modalità incomplete | 4 |
| REC-008 | Ricetta manuale | valori conservati senza righe | 4 |
| REC-009 | Modificare ricetta personale | nuova versione | 4 |
| REC-010 | Modificare singolo pasto | altra occorrenza invariata | 4 |
| REC-011 | Applicare a future occorrenze | solo date successive aggiornate | 4 |
| REC-012 | Consultare storico | versione originale disponibile | 4 |
| REC-013 | Digest invariato | cache riutilizzata | 4 |
| REC-014 | Digest diverso | nutrienti ricalcolati | 4 |
| REC-015 | Archiviare ricetta | storico e occorrenze validi | 4 |

## 4. IndexedDB e backup

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| DB-001 | Primo avvio V5 | database e store creati | 2 |
| DB-002 | Upgrade interrotto | nessuna perdita, ripresa sicura | 2/8 |
| DB-003 | Migrare data iniziale V4 | stessa data nel piano locale | 2 |
| DB-004 | Export database vuoto | backup valido | 2 |
| DB-005 | Export con dati personali | tutte le dipendenze incluse | 2 |
| DB-006 | Round-trip completo | equivalenza semantica | 2 |
| DB-007 | JSON non valido | nessuna scrittura | 2 |
| DB-008 | Schema futuro | import bloccato, anteprima leggibile | 2 |
| DB-009 | Digest errato | import bloccato | 2 |
| DB-010 | Errore durante transazione | rollback completo | 2 |
| DB-011 | Import solo ricette | calendario invariato | 2 |
| DB-012 | Import solo calendario | libreria estranea non sovrascritta | 2 |
| DB-013 | Cambiare dominio | export/import necessario e riuscito | 8 |
| DB-014 | Pulire cache PWA | IndexedDB invariato | 8 |

## 5. Calendario

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| CAL-001 | Inizializzare da D1 | 180 giorni locali | 5 |
| CAL-002 | D2 oltre mezzanotte | 03:30 e 08:20 con offset 1 | 5 |
| CAL-003 | Segnare non seguito | sequenza invariata | 5 |
| CAL-004 | Segnare parziale | singoli pasti modificabili | 5 |
| CAL-005 | Lasciare data OFF | data presente, nessun pasto | 5 |
| CAL-006 | Giornata FREE | data presente, sequenza invariata | 5 |
| CAL-007 | D4 sostituito con D2 | data invariata, menu da decidere | 5-6 |
| CAL-008 | Inserire giorno | futuro +1 giorno, fine estesa | 5 |
| CAL-009 | Rimuovere giorno | futuro -1 giorno, fine ridotta | 5 |
| CAL-010 | Posticipare | nuova data libera e futuro spostato | 5 |
| CAL-011 | Annullare inserimento | stato precedente ripristinato | 5 |
| CAL-012 | Ripetere operazione | stato successivo ripristinato | 5 |
| CAL-013 | Cambio ora marzo | date civili consecutive | 5 |
| CAL-014 | Cambio ora ottobre | date civili consecutive | 5 |
| CAL-015 | Anno bisestile | 29 febbraio gestito | 5 |
| CAL-016 | Due giorni con stessa data | vincolo univoco impedisce salvataggio | 5 |

## 6. Compositore pasti

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| CMP-001 | Mantenere pasti cambiando turno | ricette stesse, orari modificabili | 6 |
| CMP-002 | Caricare altro D2 | slot e versioni copiati | 6 |
| CMP-003 | Selezionare ricetta personale | occorrenza valida | 6 |
| CMP-004 | Filtrare consumabile freddo | risultati compatibili | 6 |
| CMP-005 | Filtrare fibra moderata | ordinamento coerente | 6 |
| CMP-006 | Evitare ripetizione recente | penalizzazione applicata | 6 |
| CMP-007 | Bloccare un pasto | suggerimenti non lo modificano | 6 |
| CMP-008 | Giornata sotto target | suggerimenti, nessuna modifica automatica | 6 |
| CMP-009 | Ricetta incompatibile col turno | avviso visibile | 6 |
| CMP-010 | Pasti D2 | offset e ordinamento corretti | 6 |

## 7. Integrazione

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| INT-001 | Cambiare ricetta futura | spesa aggiornata | 7 |
| INT-002 | Cambiare ricetta futura | preparazioni aggiornate | 7 |
| INT-003 | Inserire giorno | ICS aggiornato | 7 |
| INT-004 | Segnare passato non seguito | spesa futura invariata | 7 |
| INT-005 | Rimuovere pasto futuro | ingrediente escluso dalla spesa | 7 |
| INT-006 | Creare ricetta | compare in ricerca | 7 |
| INT-007 | Archiviare ricetta | scompare dai nuovi selettori | 7 |
| INT-008 | Uso offline | modifiche e calcoli disponibili | 7-8 |
| INT-009 | Aggiornare service worker | dati personali conservati | 8 |
| INT-010 | Reset piano | base rigenerata, libreria personale conservabile | 7 |

## 8. Accessibilità e usabilità

| ID | Caso | Atteso | Fase |
|---|---|---|---:|
| UX-001 | Editor ingrediente da tastiera | percorso completo disponibile | 3/8 |
| UX-002 | Errori modulo | associati al campo e annunciati | 3/8 |
| UX-003 | Confronto prima/dopo | leggibile su mobile | 4/8 |
| UX-004 | Operazione su 70 giorni | impatto mostrato prima della conferma | 5/8 |
| UX-005 | Annulla | disponibile dopo operazione | 5/8 |
| UX-006 | Colore | mai unico segnale | tutte |
| UX-007 | Modulo lungo | salvataggio bozza locale | 3-4/8 |
| UX-008 | Riduzione movimento | animazioni non essenziali disabilitate | 8 |

## 9. Gate di rilascio V5.0.0

- zero perdite dati nei test di migrazione e backup;
- zero errori schema nei record salvati;
- ricalcolo del seed entro tolleranza;
- tutte le operazioni estese annullabili;
- nessun modulo V4 legge il piano base ignorando il piano effettivo;
- test browser desktop e mobile;
- prova offline;
- prova manuale Android e iOS raccomandata dopo il deploy;
- `PROJECT_MEMORY.md` aggiornato;
- backup V4/V5 conservato prima della pubblicazione.


## 10. Stato dopo la Fase 3

I casi `ING-001`, `ING-003`-`ING-009`, `ING-011` e `ING-012` hanno copertura automatica diretta nel gate `phase3.sh`. `ING-002` è coperto dal medesimo contratto `basis.unit = ml` e viene mantenuto come caso browser/manuale aggiuntivo. `ING-010` sarà completato nella Fase 4 quando le ricette personali potranno puntare a revisioni specifiche. `ING-013` e `ING-014` restano coperti dal motore di import della Fase 2 e verranno ritestati con pacchetti ricette reali nella Fase 4.

La QA browser specifica è `scripts/qa_v5_phase3.py`; deve essere eseguita su GitHub Pages o su un ambiente Chromium che non blocchi localhost.


## 11. Stato dopo la Fase 4

Copertura automatica nel gate `phase4.sh`:

- `REC-001` creazione da ingredienti base/personali;
- `REC-002` ingrediente personale;
- `REC-003` basi g/ml supportate dal medesimo motore di normalizzazione;
- `REC-004` unità personalizzata e conversione;
- `REC-005` porzioni e valori per porzione;
- `REC-009` modifica ricetta -> nuova versione;
- `REC-012` storico versioni;
- `REC-013`/`REC-014` digest di input generato dal contenuto;
- `REC-015` archiviazione sicura;
- `ING-010` completato: ogni riga ricetta conserva `ingredientRevisionId`;
- `ING-013`/`ING-014` ritestati attraverso backup `recipes` con dipendenze.

Restano intenzionalmente differiti:

- `REC-006` moltiplicatore della singola occorrenza -> Fase 6;
- `REC-007` editor di ricette incomplete -> dominio presente, UI non esposta;
- `REC-008` editor di ricette manuali -> dominio presente, UI non esposta;
- `REC-010` e `REC-011` override/applicazione alle occorrenze -> Fasi 5-6.

QA browser specifica: `scripts/qa_v5_phase4.py`. Nell'ambiente OpenAI corrente Chromium di sistema può avviarsi ma la navigazione localhost è bloccata da policy amministrativa (`ERR_BLOCKED_BY_ADMINISTRATOR`); eseguire lo script contro GitHub Pages o su una macchina locale.


## 12. Copertura automatica dopo la Fase 5

Il gate `phase5.sh` copre direttamente i casi calendario della Fase 5:

- materializzazione iniziale di 180 giorni;
- coda D2 oltre mezzanotte;
- aderenza senza spostamento della sequenza;
- D1–D5/OFF/CUSTOM con conservazione dei pasti;
- FREE con rimozione del menu;
- inserimento/posticipo a 181 giorni;
- rimozione a 179/180 giorni;
- ripristino giornata;
- ripristino del futuro dopo inserimenti e rimozioni precedenti;
- patch prima/dopo e undo;
- redo e cancellazione del ramo redo dopo una nuova modifica;
- riattivazione di un piano precedente;
- schema `planInstance`, `calendarDay`, `operationRecord`;
- backup calendario con checksum;
- overlay delle giornate personalizzate nella vista mensile;
- QA browser desktop/mobile senza overflow.

Restano per la Fase 6 i casi di selezione/sostituzione delle ricette nelle singole occorrenze e il bilanciamento assistito della giornata.


## 13. Esito release 5.0.0

Gate automatici aggiunti nella Fase 8:

| ID | Verifica | Esito |
|---|---|---|
| REL-001 | versioni HTML/JSON convergono su 5.0.0 | PASS |
| REL-002 | nessun badge alpha/fase nella UI pubblica | PASS |
| REL-003 | cache core copre tutti i JS globali | PASS |
| REL-004 | installazione service worker atomica | PASS |
| REL-005 | migrazione alpha preserva dati personali | PASS |
| REL-006 | backup alpha schema 1 compatibile | PASS |
| REL-007 | import replace + rollback | PASS |
| REL-008 | Planner/Compositore offline con query | PASS |
| REL-009 | offline pack completo | PASS, 639/639 |
| REL-010 | update SW preserva IndexedDB | PASS |
| REL-011 | audit accessibilità 588 pagine | PASS, 0 errori |
| REL-012 | stress 96 operazioni + undo/redo completo | PASS |
| REL-013 | mobile 390 px senza overflow nelle viste principali | PASS |

La prova standalone su hardware iOS/Android reale resta manuale post-deploy.

## 14. Gate release 5.1.0

| ID | Verifica | Automazione |
|---|---|---|
| V51-001 | UI usa G/N/SN/R1/R2 e non espone D1-D5 | `test_v5_1_ui.py` |
| V51-002 | palette nota all'utilizzatore | static + Chromium |
| V51-003 | M/P ammessi dal dominio | `test_v5_1_core.js` + schema |
| V51-004 | M/P usano profilo dietistico Giornata | `test_v5_1_core.js` |
| V51-005 | cambio tipo seleziona Adatta menu | `qa_v5_1.py` |
| V51-006 | modifica composta usa una conferma finale | static + Chromium |
| V51-007 | M e P persistono nel piano effettivo | `qa_v5_1.py` |
| V51-008 | preferenze salvate localmente | `qa_v5_1.py` |
| V51-009 | occasioni conteggiate per pasto | `test_v5_1_core.js` |
| V51-010 | ingredienti reali classificano uova/latticini/formaggi | `test_v5_1_core.js` |
| V51-011 | `never`/limite bloccano solo proposte automatiche | core + Chromium |
| V51-012 | preferenze incluse nel backup JSON | Chromium |
| V51-013 | Gestisci/Preferenze disponibili offline | Chromium |
| V51-014 | nessun overflow a 390 px | Chromium |
| V51-015 | regressioni V5.0 e stress 96 operazioni | `v5_1.sh` |

## 15. Gate release 5.2.0

| ID | Verifica | Automazione |
|---|---|---|
| V52-001 | riequilibrio riduce frequenze oltre limite | `test_v5_2_core.js` |
| V52-002 | pasti bloccati non vengono sostituiti | `test_v5_2_core.js` |
| V52-003 | profilo nutrizionale medio resta vicino | `test_v5_2_core.js` |
| V52-004 | riequilibrio supporta selezione parziale | `qa_v5_2.py` |
| V52-005 | riequilibrio applicato come una operation | `qa_v5_2.py` |
| V52-006 | scheduler produce N proposte su date distinte | `test_v5_2_core.js` |
| V52-007 | scheduler mantiene scostamento nutrizionale numerico | `test_v5_2_core.js` |
| V52-008 | scheduler supporta conferma parziale | `qa_v5_2.py` |
| V52-009 | scheduler applicato come una operation | `qa_v5_2.py` |
| V52-010 | Spesa apre su oggi | `qa_v5_2.py` |
| V52-011 | preset Spesa 7 giorni compila intervallo | `qa_v5_2.py` |
| V52-012 | Oggi rispetta nuovo ordine | `qa_v5_2.py` |
| V52-013 | card Calendario attivo assente | static + Chromium |
| V52-014 | Piano assente da toolbar e presente in fondo Calendario | static + Chromium |
| V52-015 | pagine core V5.2 disponibili offline | `qa_v5_2.py` |
| V52-016 | mobile 390 px senza overflow | `qa_v5_2.py` |
| V52-017 | accessibilità tutte le pagine | `test_v5_2_accessibility.py` |
| V52-018 | regressioni V5 + stress 96 operazioni | `v5_2.sh` |
