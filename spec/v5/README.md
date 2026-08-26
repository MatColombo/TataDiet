# TataDiet V5 - esempi normativi

Gli esempi in `examples/` rappresentano record del modello locale normalizzato definito da:

```text
schemas/v5/domain/tatadiet-v5.schema.json
```

Sono validati da:

```bash
python3 scripts/validate_v5_schemas.py
```

La raccolta comprende:

- ingrediente personale e relativa revisione nutrizionale;
- ricetta personale e relativa versione;
- istanza del piano;
- giornata personalizzata;
- operazione annullabile;
- backup completo minimo.

Le fixture non duplicano i 130 ingredienti e le 547 versioni base: i riferimenti al namespace `base:` possono puntare agli snapshot in `v5_data/base/`. I riferimenti personali `usr:` devono invece risolversi tra le fixture o all'interno del backup validato.
