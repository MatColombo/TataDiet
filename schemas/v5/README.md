# TataDiet V5 - Schemi dati

La Fase 1 congela due rappresentazioni complementari dello stesso modello.

## `base/` - snapshot di trasporto immutabili

Questi schemi validano i record generati in `v5_data/base/` direttamente dal workbook.
Usano nomi `snake_case` e sono pensati per distribuzione, audit e inizializzazione deterministica.

- `ingredient.schema.json`
- `recipe-family.schema.json`
- `recipe-version.schema.json`
- `calendar-day.schema.json`

Il record ingrediente di trasporto è denormalizzato: contiene identità, `revision_id` e valori nutrizionali nello stesso oggetto.

## `domain/` - dominio normalizzato locale

`domain/tatadiet-v5.schema.json` è il contratto canonico per IndexedDB e backup JSON.
Usa nomi `camelCase` e separa esplicitamente:

- ingrediente e revisione ingrediente;
- ricetta e versione ricetta;
- istanza del piano e giornata calendario;
- operazioni reversibili;
- involucro del backup.

La Fase 2 implementerà un adattatore che importa il seed `base/` negli object store del dominio senza rendere mutabili i record originari.

## Esempi e validazione

Gli esempi del dominio sono in `spec/v5/examples/`. Il comando autorevole è:

```bash
./phase1.sh
```

Il comando valida schemi ed esempi, verifica tutti i record del seed, ricostruisce due volte il seed per confermarne il determinismo e controlla la regressione strutturale del runtime V4. Il comando `./qa.sh` aggiunge la ricostruzione completa della V4 e i test logici JavaScript.
