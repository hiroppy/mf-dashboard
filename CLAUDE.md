# Claude Code Development Guidelines

## Mandatory Rules (MUST)

The following rules must always be followed. Code violating these rules will be rejected in review.

### DB Schema

- [ ] All tables MUST have `createdAt: text("created_at").notNull()`
- [ ] All tables MUST have `updatedAt: text("updated_at").notNull()`
- [ ] Foreign keys MUST specify `onDelete` (cascade/set null)
- [ ] When adding/modifying DB schema, MUST update `docs/architecture/database-schema.md` to reflect current schema structure

### Component Creation

- [ ] All components under `components/` MUST have `*.stories.tsx`
- [ ] Chart-related: separate into `charts/` (pure UI) and `info/` (data fetching)
- [ ] `info/` components: Server Component (data fetching) + `.client.tsx` ONLY if interactivity is required

### Testing

- [ ] New logic MUST have unit tests
- [ ] After writing Storybook, verify with `test:storybook`

### Code Structure

- [ ] Do NOT create barrel files (`index.ts` for re-exports)
- [ ] Import directly from the source file

### Logging (Crawler)

For the crawler (`apps/crawler`), use the following log functions appropriately:

- [ ] Use `info()` for important information that should be visible in CI environments (GitHub Actions)
- [ ] Use `log()` for detailed logs during local development (hidden in CI environments)
- [ ] Use `debug()` for debug information (visible when `DEBUG=true`)

**Log Level Guidelines:**

| Function  | Local | CI Env | Purpose                                        |
| --------- | ----- | ------ | ---------------------------------------------- |
| `info()`  | ✅    | ✅     | Important progress info, must be tracked in CI |
| `log()`   | ✅    | ❌     | Detailed debug info, local development only    |
| `debug()` | ⚙️    | ❌     | Debug mode only (enabled with `DEBUG=true`)    |
| `warn()`  | ✅    | ✅     | Warnings                                       |
| `error()` | ✅    | ✅     | Errors                                         |

(⚙️ = Enabled with `DEBUG=true`)

**Example:**

```typescript
import { info, log, warn } from "./logger.js";

// Important information that should be visible in CI
info("Refreshing accounts...");
info(`[${elapsed}s] Remaining: ${updatingCount}`);

// Detailed logs for local development (hidden in CI)
log("Navigating to accounts page...");
log(`Found ${count} rows in the table`);

// Warnings (always visible)
warn("Max wait time exceeded");
```

### Personal Information (Strictly Prohibited)

**NEVER include personally identifiable information (PII) in test data, Storybook, comments, or documentation.**

- [ ] Do NOT use real names or nicknames → Use "User A", "User B", "Group A", etc.
- [ ] Do NOT use real addresses, phone numbers, or email addresses
- [ ] Do NOT use real account numbers or card numbers
- [ ] Do NOT include personal names in code comments

**Use anonymous placeholders:**

| NG                     | OK                 |
| ---------------------- | ------------------ |
| Real person's account  | User B's account   |
| Named group            | Group A            |
| Real name              | Test User          |
| real-email@example.com | user-a@example.com |

### Semantic Colors (Strictly Enforced)

Always use these classes for monetary values. Custom color definitions are prohibited.
See `apps/web/src/app/globals.css` for CSS variable definitions.

| Purpose          | Class                   |
| ---------------- | ----------------------- |
| Income amount    | `text-income`           |
| Expense amount   | `text-expense`          |
| Positive balance | `text-balance-positive` |
| Negative balance | `text-balance-negative` |

**Usage Guidelines:**

- `text-income` / `text-expense` — Actual amounts (income, expenses)
- `text-balance-positive` / `text-balance-negative` — Differences or evaluations (balance, unrealized gains/losses)

**Decision Tree:**

"Did money actually move?"

- **Yes** → `text-income` / `text-expense`
- **No (comparison/evaluation/change)** → `text-balance-positive` / `text-balance-negative`

**Specific Use Cases:**

| Use Case                     | Correct Class           | Reason                          |
| ---------------------------- | ----------------------- | ------------------------------- |
| Food expense ¥5,000          | `text-expense`          | Actual expense                  |
| Salary ¥300,000              | `text-income`           | Actual income                   |
| Day-over-day +¥10,000        | `text-balance-positive` | Comparison difference           |
| Day-over-day -¥5,000         | `text-balance-negative` | Comparison difference           |
| Unrealized gain +¥50,000     | `text-balance-positive` | Valuation gain/loss             |
| Unrealized loss -¥30,000     | `text-balance-negative` | Valuation gain/loss             |
| Monthly balance +¥20,000     | `text-balance-positive` | Income minus expense difference |
| Monthly balance -¥10,000     | `text-balance-negative` | Income minus expense difference |
| Liability balance ¥1,000,000 | `text-balance-negative` | Negative item on balance sheet  |
| Asset change +¥100,000       | `text-balance-positive` | Period-over-period change       |

**Common Mistakes:**

```tsx
// ❌ Wrong: Using text-income/expense for asset changes
<span className={value > 0 ? "text-income" : "text-expense"}>
  {formatCurrency(value)}
</span>

// ✅ Correct: Using text-balance-* for differences/changes
<span className={value > 0 ? "text-balance-positive" : "text-balance-negative"}>
  {formatCurrency(value)}
</span>
```

**Example:**

```tsx
// Expense amount → text-expense
<span className="text-expense">{formatCurrency(expense)}</span>

// Negative balance → text-balance-negative
<span className={balance >= 0 ? "text-balance-positive" : "text-balance-negative"}>
  {formatCurrency(balance)}
</span>

// Unrealized gains/losses → text-balance-positive / text-balance-negative
<span className={gain >= 0 ? "text-balance-positive" : "text-balance-negative"}>
  {formatCurrency(gain)}
</span>
```

### Color Changes

- [ ] When modifying colors in `globals.css`, MUST run `test:storybook` to verify a11y compliance
- [ ] All text colors MUST meet WCAG 2.1 minimum contrast ratio of 4.5:1 against white background

---

## Project Structure

Monorepo using pnpm workspaces + Turborepo.

- `apps/crawler` — Money Forward scraper
- `apps/mcp` — MCP server (Claude Desktop / Claude Code 連携)
- `apps/web` — Next.js dashboard
- `packages/analytics` — Financial analysis & tool definitions (shared)
- `packages/db` — Database schema & repositories (shared)
- `packages/meta` — Category definitions & URLs (shared)

## Development Guidelines

### Package Manager

- **Use pnpm** (do not use npm or yarn)
- Add dependencies: `pnpm --filter <package> add <dep>`
- Install all: `pnpm install`

### Building

- **Do not run `pnpm build` during development**
- Only build Next.js app when explicitly requested by the user
- Type checking: `pnpm turbo typecheck`

### Linting & Formatting

- Lint: `pnpm lint` (runs oxlint + knip)
- Format: `pnpm format`
- Format check: `pnpm format:check`

### Running the Crawler

- Run: `pnpm --filter @mf-dashboard/crawler start`
- Development/Debug: `pnpm --filter @mf-dashboard/crawler dev:scrape`
- **When LLM (Claude) runs scraping, use `dev:scrape`**
- If `data/auth-state.json` exists, it will be used automatically

#### Scraping Mode (Auto-detected)

Scraping mode is automatically determined by database existence:

- **DB exists** (`data/moneyforward.db`): `month` mode (fetches current month only)
- **DB does not exist**: `history` mode (fetches past 13 months)

**To re-fetch historical data**, delete the database:

```bash
rm data/moneyforward.db
pnpm --filter @mf-dashboard/crawler start
```

**For testing**: Use `SCRAPE_MODE=history` or `SCRAPE_MODE=month` to force a specific mode

**To clean up groups deleted from MoneyForward**: Use `CLEANUP_GROUPS=true` to delete groups from DB that no longer exist in MoneyForward. By default, groups are only upserted and never deleted.

```bash
CLEANUP_GROUPS=true pnpm --filter @mf-dashboard/crawler start
```

### Database

- SQLite database is located at `data/moneyforward.db`
- Generate migration: `pnpm --filter @mf-dashboard/db exec drizzle-kit generate`
- Apply migration: `pnpm --filter @mf-dashboard/db exec drizzle-kit migrate`
- Database Studio: `pnpm db:studio`

### Test & Storybook Data

- When creating dummy data for tests or Storybook, **do not reference** `data/moneyforward.db` (contains personal information)
- `data/demo.db` can be used as reference
- Run web app with demo data: `pnpm --filter @mf-dashboard/web dev:demo`

### Testing

- Run all tests: `pnpm test`
- Web unit tests: `pnpm --filter @mf-dashboard/web test:unit`
- Web Storybook tests: `pnpm --filter @mf-dashboard/web test:storybook`
- Web E2E tests: `pnpm --filter @mf-dashboard/web test:e2e`
- Storybook: `pnpm --filter @mf-dashboard/web storybook`

### Debugging

- Place debug scripts in the `debug/` directory under each `apps/` or `packages/` package
- Do not create temporary files like `debug-*.ts` or `test-*.ts` inside `src/`

#### Crawler-specific

- Save screenshots in the `apps/crawler/debug/` directory
- To login with saved auth state, use `loginWithAuthState` from `apps/crawler/src/auth/login.ts`
