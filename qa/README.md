# QA TataDiet

I report sono conservati per checkpoint/release.

- `v5-phase8/`: baseline stabile 5.0.0.
- `v5.1/`: gate e screenshot della release 5.1.0.

Release corrente:

```bash
./v5_1.sh
```

QA browser della V5.1:

```bash
python3 scripts/qa_v5_1.py --base-url <URL-root-del-sito>
```

Il browser test usa un profilo temporaneo e verifica Gestisci giornata, M/P, preferenze, backup, offline e viewport mobile. La prova standalone su hardware iOS/Android rimane manuale post-deploy.
