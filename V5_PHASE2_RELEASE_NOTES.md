# TataDiet V5 - Fase 2 completata

**Checkpoint:** `5.0.0-alpha.2-phase2`  
**Dataset base:** `tatadiet-base-v1`  
**Obiettivo:** fondazione local-first, senza editor ingredienti/ricette.

## Implementato

- database IndexedDB `tatadiet-v5`, schema 1;
- 10 object store con gli indici definiti nella specifica;
- seed locale del catalogo base immutabile: 130 ingredienti, 306 ricette, 547 versioni;
- migrazione una-tantum dalla V4 della data iniziale e delle checklist spesa riconosciute;
- bridge della data iniziale V4 -> impostazione V5;
- backup JSON `full`, `recipes`, `calendar`, `settings`;
- checksum SHA-256 canonico del backup;
- verifica di formato, checksum e compatibilità del dataset prima dell'import;
- anteprima con conteggi e conflitti;
- import `replace`, `merge`, `recipes`, `calendar`, `settings`;
- rimappatura degli ID personali in conflitto durante il merge;
- checkpoint pre-import persistito in IndexedDB;
- rollback dell'ultima importazione;
- transazione unica per le scritture dell'import;
- checklist migrate incluse nel backup completo;
- UI di gestione dati V5 nella pagina Utilità;
- seed V5 pubblicato in `docs/data/v5/` e incluso nel pacchetto offline.

## Regole consolidate

1. Il catalogo base non viene mai esportato come dato personale e non viene sovrascritto da un import.
2. Un backup porta con sé ID e SHA-256 del dataset base richiesto.
3. Un checksum errato blocca l'importazione prima di qualsiasi scrittura.
4. Un dataset base incompatibile blocca l'importazione.
5. `replace` elimina solo dati personali; ingredienti e ricette base rimangono disponibili.
6. `merge` preserva i record esistenti e rimappa gli ID personali incompatibili.
7. Il checkpoint pre-import è creato prima della transazione di scrittura ed è utilizzabile per rollback.
8. Le cache PWA non fanno parte del backup dei dati personali.
9. Gli editor rimangono intenzionalmente esclusi fino alla Fase 3.

## QA

Il gate automatico verifica:

- build completa del runtime;
- 584 pagine e link interni;
- regressione calendario e logica V4;
- regressione completa della Fase 1;
- sintassi dei moduli JavaScript V5;
- round-trip del backup con database mock transazionale;
- checksum corrotto correttamente rifiutato;
- preservazione dei record base;
- rollback al checkpoint pre-import.

La QA browser automatica specifica IndexedDB è presente in `scripts/qa_v5_phase2.py`. Nell'ambiente di build corrente Chromium è bloccato da policy amministrativa per navigazioni locali, quindi il gate di rilascio usa i test logici e strutturali; la pagina deve essere verificata anche su un browser reale dopo il deploy GitHub Pages.
