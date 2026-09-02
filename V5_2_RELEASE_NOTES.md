# TataDiet 5.2.0 — release notes

Data: 2 settembre 2026.

## Nuove funzioni

- **Riequilibra piano** da Preferenze alimentari: prossima giornata, 7 giorni, 30 giorni o tutto il futuro; preview globale, selezione parziale e conferma atomica.
- **Programma nel calendario** per ricette base e personali: N occorrenze su 7/30 giorni o resto del piano, date distinte, compatibilità con turno e porzione adattata al pasto sostituito.
- Navigazione semplificata: aggiunti stabilmente Ricette, Preferenze e Utilità nella toolbar mobile/desktop; Piano rimosso e spostato a fondo Calendario.
- Oggi riordinato: giornata, prossimo pasto, pasti civili, nutrienti, 48 ore.
- Spesa per date come route principale, default oggi e preset Oggi/Domani/48h/5gg/7gg; vecchie liste ciclo/variante spostate in `/spesa/cicli/`.

## Compatibilità

- IndexedDB resta `tatadiet-v5`.
- `DB_VERSION = 1` e `SCHEMA_VERSION = 1`.
- Backup V5.0/V5.1 compatibili.
- Nessuna migrazione distruttiva dei dati personali.

## Correzioni emerse dal QA

- corretto ordine di caricamento fra planning core e composer core;
- corretto overflow mobile del selettore periodo scheduler;
- corretto `NaN%` nello scostamento nutrizionale della programmazione ricetta;
- QA aggiornata ai selettori reali della nuova UI.

## Gate finale

```text
592 HTML
44.713 link/risorse/frammenti
0 errori
0 warning
650 risorse offline
17.113.344 byte offline
```

Accessibilità: 592 pagine, 1.187 immagini, 2.220 pulsanti, 21.033 link, 2.217 controlli form, 0 errori e 0 warning.

Stress: 96 operazioni con undo/redo completo.

Chromium end-to-end: 23/23 controlli superati, 0 errori JavaScript.
