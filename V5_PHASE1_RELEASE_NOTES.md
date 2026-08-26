# TataDiet V5 - Fase 1 completata

**Checkpoint:** `5.0.0-alpha.1-phase1`  
**Runtime pubblicabile:** V4.0.0, invariato  
**Dataset base:** `tatadiet-base-v1`

## Risultato

La Fase 1 ha trasformato il contenuto alimentare esistente in una fondazione dati verificata per la futura V5 local-first. Non sono stati ancora introdotti editor o modifiche visibili nell'app.

Sono stati definiti e congelati:

- 130 ingredienti base, con identità e revisione nutrizionale;
- 306 famiglie di ricette;
- 547 versioni immutabili di ricetta;
- 180 giornate template;
- 864 occorrenze pasto;
- 3.189 righe ingrediente collegate alle ricette;
- il modello del calendario locale modificabile;
- il formato di backup/import JSON;
- gli schemi per dati base e dati personali.

## Gate superati

| Controllo | Esito |
|---|---:|
| Ingredienti catalogati | 130 |
| Pasti strutturati ricalcolati | 846 / 846 |
| Pasti flessibili manuali | 18 |
| Scarto nutrizionale massimo | 0,05 |
| Formule Excel controllate | 5.308 |
| Cache formula mancanti | 0 |
| Errori Excel memorizzati | 0 |
| Record seed validati contro schema | 1.163 |
| Esempi di dominio validi | 8 |
| Casi negativi correttamente rifiutati | 7 |
| Generazioni seed confrontate | 2, hash identici |
| Regressione runtime V4 | 584 pagine, 25.144 link, 0 errori |

## Decisioni congelate

1. I dati personali restano nel browser e non vengono inviati a GitHub.
2. Il dataset base è immutabile e sempre ripristinabile.
3. Un ingrediente personale ha un'identità stabile e revisioni immutabili.
4. Una ricetta ha un'identità stabile e versioni immutabili.
5. Ogni pasto punta a una versione precisa della ricetta.
6. Lo storico non viene modificato retroattivamente per impostazione predefinita.
7. I nutrienti core obbligatori per un nuovo ingrediente sono kcal, proteine, carboidrati, grassi e fibra per 100 g o 100 ml.
8. Zuccheri, saturi, sale e sodio sono supportati ma facoltativi.
9. Le unità come pezzo, vasetto o cucchiaio richiedono una conversione esplicita verso g o ml.
10. Le operazioni estese sul calendario devono essere transazionali e annullabili.
11. Il backup esporta il dominio personale normalizzato e riferisce ID e hash del dataset base.
12. Tutti i moduli futuri devono leggere dallo stesso `EffectivePlanRepository`.

## Lacune note non bloccanti

- 104 ingredienti base non dichiarano uno stato normalizzato crudo/cotto/sgocciolato.
- Le fonti nutrizionali sono documentate a livello di dataset, non per singolo alimento.
- Il workbook non contiene zuccheri, saturi, sale o sodio.
- Le ricette base non hanno passaggi di preparazione strutturati.
- Le porzioni base sono inferite come una persona.
- I 18 pasti flessibili hanno valori manuali, ma non ingredienti quantitativi.

## Handoff alla Fase 2

La Fase 2 deve implementare esclusivamente la fondazione locale:

- IndexedDB schema 1;
- store e indici previsti dalla specifica;
- adattatore seed `snake_case` verso dominio `camelCase`;
- migrazione di data iniziale e checklist V4;
- export completo JSON;
- import con anteprima, validazione, backup preventivo e rollback;
- test di round-trip semantico;
- conservazione dei dati durante aggiornamenti PWA.

Gli editor ingredienti e ricette restano fuori dalla Fase 2 e iniziano rispettivamente nelle Fasi 3 e 4.
