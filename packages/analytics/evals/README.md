# Finance chat evaluations

The suite runs the production finance chat tools against the deterministic demo database and checks
the final text and cards with promptfoo.

```bash
AI_PROVIDER=openai AI_MODEL=gpt-4o-mini AI_API_KEY=... \
  pnpm --filter @mf-dashboard/analytics eval:chat
```

The command rebuilds `data/demo.db` for July 2026 before running. It does not read
`data/moneyforward.db`.
