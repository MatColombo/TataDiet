# TataDiet V5 - Fase 3 completata

**Checkpoint:** `5.0.0-alpha.3-phase3`  
**Dataset base:** `tatadiet-base-v1`  
**Obiettivo:** Studio ingredienti personale, local-first e versionato.

## Implementato

- nuova pagina `ingredienti/` con catalogo base e personale;
- ricerca e filtri per origine, categoria e stato;
- 130 ingredienti base consultabili ma immutabili;
- duplicazione di una voce base come ingrediente personale;
- creazione manuale di ingredienti personali;
- nutrienti core obbligatori: kcal, proteine, carboidrati, grassi, fibra;
- nutrienti opzionali: zuccheri, saturi, sale e sodio;
- base nutrizionale per 100 g o per 100 ml;
- stato dell'alimento: crudo, cotto, secco, sgocciolato, preparato, pronto al consumo, come venduto o non specificato;
- marca, alias, allergeni, note di tollerabilità e fonte;
- conversioni facoltative per pezzo, porzione, cucchiaio, cucchiaino, tazza, grammi o millilitri;
- controllo di plausibilità energetica con formula 4/4/9 non bloccante;
- warning su stato non specificato, nutrienti opzionali mancanti e nomi duplicati;
- nuova revisione immutabile a ogni modifica di un ingrediente personale;
- cronologia revisioni consultabile;
- archiviazione e riattivazione;
- eliminazione consentita soltanto quando nessuna versione di ricetta referenzia l'ingrediente;
- protezione esplicita dei record base contro modifica, archiviazione ed eliminazione;
- normalizzazione una-tantum dei record ingrediente seminati nelle alpha precedenti;
- integrazione con backup `full` e `recipes` della Fase 2;
- pagina e moduli inclusi nel pacchetto PWA/offline.

## Regole consolidate

1. Il catalogo base è immutabile.
2. Una personalizzazione di un ingrediente base parte sempre da una copia personale.
3. Una revisione già esistente non viene modificata in-place.
4. `ingredient.currentRevisionId` identifica la revisione corrente.
5. Le revisioni precedenti restano disponibili per le future ricette versionate e per lo storico.
6. Un ingrediente referenziato non può essere eliminato; può essere archiviato.
7. I valori sconosciuti opzionali restano `null`, non zero.
8. La stima 4/4/9 è un controllo di plausibilità e non sostituisce l'energia dichiarata.
9. I dati personali restano in IndexedDB e vengono trasferiti tramite backup JSON.
10. Lo Studio ricette resta escluso fino alla Fase 4.

## QA

Il gate `./phase3.sh` verifica:

- build completa e link;
- regressione calendario e logica V4;
- regressione backup/import Fase 2;
- regressione completa Fase 1;
- sintassi dei moduli JavaScript;
- validazioni ingrediente;
- normalizzazione dei vecchi valori snake_case;
- creazione revisione 1;
- creazione revisione successiva senza cancellare la precedente;
- warning duplicato;
- archiviazione/riattivazione;
- immutabilità del base;
- blocco eliminazione quando referenziato;
- validazione JSON Schema dei record personali prodotti dal core.

`scripts/qa_v5_phase3.py` contiene inoltre la QA browser end-to-end desktop/mobile. Nell'ambiente di build corrente Chromium blocca le navigazioni localhost per policy amministrativa; eseguire lo script contro GitHub Pages o su una macchina locale.
