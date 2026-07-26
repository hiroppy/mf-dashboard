# Finance chat evaluations

The evaluation runs the production finance-chat prompt and tools against the anonymous
`data/demo.db` fixture. It grades the final answer, charts, Markdown rows, and dashboard links;
tool-call order and agent trajectory are intentionally out of scope. Finance values are also
checked against trusted fixture queries that are executed separately from model-generated SQL.

Set `AI_PROVIDER`, `AI_MODEL`, and `AI_API_KEY`, then run:

```sh
pnpm --filter @mf-dashboard/analytics eval:chat
```

The command rebuilds `data/demo.db` for the fixed evaluation period before invoking promptfoo.
