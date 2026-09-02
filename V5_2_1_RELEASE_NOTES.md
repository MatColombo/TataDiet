# TataDiet 5.2.1

Patch compatibile con 5.2.0, senza migrazione distruttiva.

## Correzioni

- Riequilibrio Preferenze: recupera automaticamente un calendario personale già configurato anche quando `activePlanInstanceId` manca o è obsoleto.
- Se esiste soltanto la data iniziale salvata, il piano effettivo viene materializzato automaticamente dal template base.
- Lo stesso recupero è disponibile per le viste effettive e la programmazione ricette.
- Oggi: rimossa la descrizione introduttiva, header ridotto a versione + titolo.
- Card turno: sigla UI colorata, data, nome completo del turno e orario; mai D1/D2 come sigla visibile.
- Fallback statico Oggi allineato alle sigle G/N/SN/R1/R2/M/P.
- Layout Oggi reso più compatto riducendo padding, titoli e spazi verticali.

## Compatibilità

IndexedDB resta `tatadiet-v5`, `DB_VERSION=1`, `SCHEMA_VERSION=1`. Ingredienti, ricette, preferenze, calendario, operazioni e backup V5.x restano compatibili.

## QA

- 592 HTML; 44.713 riferimenti; 0 errori; 0 warning.
- 650 risorse offline.
- Stress: 96 operazioni con undo/redo completo.
- QA browser V5.2: 23/23.
- Regressione patch dedicata: calendario configurato senza active ID recuperato, riequilibrio aperto, Oggi con N colorata/Turno notte/orario, nessun overflow mobile.
