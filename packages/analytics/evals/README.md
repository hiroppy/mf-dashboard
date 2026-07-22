# Finance chat evaluations

`pnpm --filter @mf-dashboard/analytics eval:chat` generates the fixed `2026-07`
demo fixture and runs the cases in `cases.yaml` with promptfoo.

Set `AI_PROVIDER`, `AI_MODEL`, and `AI_API_KEY` for the provider under test. The
custom provider intentionally accepts only the repository's `data/demo.db` so
evaluation data cannot be mixed with personal data.

The suite evaluates final text and structured cards. It does not score tool call
order, tool call IDs, duplicate retrieval, or the complete agent trajectory.
