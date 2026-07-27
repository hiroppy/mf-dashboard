# mf-dashboard Agent Guide

Use this file for durable repository conventions, commands, constraints, and completion criteria.

## Repository Overview

This repository is a monorepo built with pnpm workspaces and Turborepo.

| Path                 | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `.agents/skills`     | Shared repository-specific agent workflows     |
| `apps/crawler`       | Money Forward scraper                          |
| `apps/web`           | Next.js dashboard                              |
| `packages/analytics` | Shared financial analysis and tool definitions |
| `packages/db`        | Shared database schema and repositories        |
| `packages/meta`      | Shared category definitions and URLs           |

## Working Agreements

- Use pnpm. Do not use npm or yarn.
- Treat `AGENTS.md` and `.agents/skills` as the canonical shared agent guidance. `CLAUDE.md` and `.claude/skills` are compatibility symlinks for Claude.
- Do not run `pnpm build` during development. Build the Next.js app only when the user explicitly requests it.
- Keep changes scoped to the request and preserve unrelated work in the worktree.
- Import directly from source files. Do not create barrel files (`index.ts` files that re-export modules).
- Put debug scripts in the package's `debug/` directory. Do not create temporary `debug-*.ts` or `test-*.ts` files under `src/`.

## Mandatory Engineering Rules

### Database Schema

- Every table must include `createdAt: text("created_at").notNull()`.
- Every table must include `updatedAt: text("updated_at").notNull()`.
- Every foreign key must specify `onDelete` (`cascade` or `set null`).
- When adding or modifying schema, update `docs/architecture/database-schema.md` to match the current structure.

### Components

- Every component under `components/` must have a corresponding `*.stories.tsx` file.
- Keep chart UI and data fetching separate: pure UI belongs in `charts/`; data-fetching components belong in `info/`.
- An `info/` component must be a Server Component that fetches data. Add a `.client.tsx` component only when interactivity requires it.

### Personal Information

Never include personally identifiable information in tests, Storybook stories, comments, or documentation.

- Do not use real names or nicknames. Use anonymous labels such as `User A`, `User B`, `Group A`, or `Test User`.
- Do not use real addresses, phone numbers, email addresses, account numbers, or card numbers.
- Use placeholder email addresses such as `user-a@example.com`.
- Do not include personal names in code comments.
- Never use `data/moneyforward.db` as a source for test or Storybook data because it contains personal information. Use `data/demo.db` instead.

### Monetary Colors

Use only the semantic classes defined in `apps/web/src/app/globals.css`. Do not define custom colors for monetary values.

| Meaning                                     | Class                   |
| ------------------------------------------- | ----------------------- |
| Actual income                               | `text-income`           |
| Actual expense                              | `text-expense`          |
| Positive difference, evaluation, or balance | `text-balance-positive` |
| Negative difference, evaluation, or balance | `text-balance-negative` |

Decision rule: if money actually moved, use `text-income` or `text-expense`. For comparisons, changes, balances, and unrealized gains or losses, use `text-balance-positive` or `text-balance-negative`.

- Liability balances use `text-balance-negative`.
- All text colors must meet the WCAG 2.1 minimum contrast ratio of 4.5:1 against a white background.
- When changing colors in `globals.css`, run `pnpm --filter @mf-dashboard/web test:storybook` to verify accessibility compliance.

### Crawler Logging

Use the logger functions according to their intended visibility:

| Function  | Local             | CI  | Purpose                                       |
| --------- | ----------------- | --- | --------------------------------------------- |
| `info()`  | Yes               | Yes | Important progress that must be visible in CI |
| `log()`   | Yes               | No  | Detailed local-development information        |
| `debug()` | With `DEBUG=true` | No  | Debug-only information                        |
| `warn()`  | Yes               | Yes | Warnings                                      |
| `error()` | Yes               | Yes | Errors                                        |

Import these functions from `./logger.js`.

### Docker Cleanup

- If an orchestrator or LLM agent starts Docker Compose for validation, it must run `docker compose down --remove-orphans` before finishing, including after failures.
- Do not pass `--volumes` unless the user explicitly authorizes deletion of persistent data.
- Start one-off validation containers with `docker run --rm`, or explicitly remove them afterward.

## QA and Test Design

- For QA, use the `ISO/IEC 25010:2023` quality model as a reference. Select the quality characteristics relevant to the change and its risks, then define verification points and acceptance criteria. Do not apply every quality characteristic uniformly.
- Select appropriate ISTQB test techniques based on the specification, risks, and quality characteristics under test. Techniques include equivalence partitioning, boundary value analysis, decision table testing, state transition testing, statement testing, branch testing, exploratory testing, checklist-based testing, and error guessing.
- In QA plans and PR descriptions, document the selected quality characteristics, test techniques, primary test conditions, and any significant risks left out of scope. Do not apply techniques as a box-checking exercise; be able to explain why each technique was selected and what coverage it is expected to provide.

### Crawler Test Layering

Use the following priority for crawler tests. See `.agents/skills/crawler-scraper/SKILL.md` for implementation details and commands.

1. Test post-extraction parsing, transformation, comparison, and decision logic as DOM-independent unit tests using anonymous strings or objects.
2. Test selectors, navigation, and HTML/DOM structure against the authenticated real service with read-only crawler E2E tests.
3. Use embedded HTML fixtures only for failure branches that cannot be represented safely and deterministically in read-only E2E. Keep the markup minimal and record the reason for the exception in a nearby test comment.

Crawler tests must not assert or log real names, balances, account identifiers, or other personal values. E2E assertions may verify only navigation and structural properties such as the presence and shape of headings, tables, rows, cells, attributes, and links.

Bound structure-only E2E navigation independently from production crawl coverage. When production must inspect every account for correctness, an E2E may inspect at most one representative detail page and skip when no suitable candidate exists; document that scope difference in the test and pull request.

## Validation and Completion

- Add unit tests for new logic.
- After adding or changing Storybook stories, run `pnpm --filter @mf-dashboard/web test:storybook`.
- Run checks relevant to the files changed. Before finishing, confirm the requested behavior, review the diff for regressions, and report which checks ran and any that were not run.

### Validation Commands

| Check               | Command                                          |
| ------------------- | ------------------------------------------------ |
| All tests           | `pnpm test`                                      |
| Type checking       | `pnpm turbo typecheck`                           |
| Lint                | `pnpm lint`                                      |
| Unused code         | `pnpm knip`                                      |
| Format              | `pnpm format`                                    |
| Format check        | `pnpm format:check`                              |
| Web unit tests      | `pnpm --filter @mf-dashboard/web test:unit`      |
| Web Storybook tests | `pnpm --filter @mf-dashboard/web test:storybook` |
| Web E2E tests       | `pnpm --filter @mf-dashboard/web test:e2e`       |
| Storybook           | `pnpm --filter @mf-dashboard/web storybook`      |

## Common Commands

### Dependencies

```bash
pnpm install
pnpm --filter <package> add <dependency>
```

### Database

The SQLite database is stored at `data/moneyforward.db`.

```bash
pnpm --filter @mf-dashboard/db exec drizzle-kit generate
pnpm --filter @mf-dashboard/db exec drizzle-kit migrate
pnpm --filter @mf-dashboard/db studio
pnpm --filter @mf-dashboard/db build:demo
```

Run the web app with demo data using `pnpm --filter @mf-dashboard/web dev`.

### Crawler

```bash
pnpm --filter @mf-dashboard/crawler start
pnpm --filter @mf-dashboard/crawler dev:scrape
```

- When an LLM agent runs scraping, use `dev:scrape`.
- If `data/auth-state.json` exists, it is used automatically.
- Save crawler screenshots in `apps/crawler/debug/`.
- To log in with saved auth state, use `loginWithAuthState` from `apps/crawler/src/auth/login.ts`.

Scraping mode is inferred from database existence:

- If `data/moneyforward.db` exists, `month` mode fetches the current month only.
- If it does not exist, `history` mode fetches the past 13 months.
- For testing, set `SCRAPE_MODE=history` or `SCRAPE_MODE=month` to override detection.
- To remove groups no longer present in Money Forward, run with `CLEANUP_GROUPS=true`. Otherwise, groups are only upserted and never deleted.

To re-fetch historical data, delete `data/moneyforward.db`, then start the crawler. Confirm the database is the intended target before deleting it.
