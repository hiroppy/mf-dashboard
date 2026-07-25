# Finance chat evaluations

The suite runs the production finance chat prompt and tools against the anonymous `data/demo.db`
fixture. It evaluates final answer facts, chart structure, Markdown transaction rows, and route-link
provenance without grading the complete tool trajectory.

```bash
pnpm --filter @mf-dashboard/db build:demo
AI_PROVIDER=openai AI_MODEL=<model> AI_API_KEY=<key> \
  pnpm --filter @mf-dashboard/analytics eval:chat
```

`eval:chat` always points `DB_PATH` at `data/demo.db`; do not use `data/moneyforward.db` for
evaluations.
