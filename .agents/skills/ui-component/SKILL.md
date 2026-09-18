---
name: ui-component
description: Use when creating new UI components under apps/web/src/components/
---

# UI Component Creation Skill

## Checklist (MUST complete all)

- [ ] Create component file
- [ ] Create `*.stories.tsx` for Storybook
- [ ] Use semantic colors for monetary values (see `AGENTS.md`)
- [ ] Verify Storybook: `pnpm --filter @mf-dashboard/web test:storybook`

## Component Types

### 1. Pure UI Components (`components/charts/` or `components/ui/`)

Data-agnostic, reusable components. Receive all data via props.

```typescript
// components/charts/my-chart.tsx
"use client";

interface MyChartProps {
  data: Array<{ label: string; value: number }>;
  // ... props only, no data fetching
}

export function MyChart({ data }: MyChartProps) {
  return (/* pure rendering */);
}
```

### 2. Data-Fetching Components (`components/info/`)

| File              | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `foo.tsx`         | Server Component - fetches data via `lib/queries`         |
| `foo.client.tsx`  | Client Component - handles interactivity (ONLY if needed) |
| `foo.stories.tsx` | Storybook - uses mock data                                |

**IMPORTANT:** Only create `.client.tsx` when interactivity is required (useState, useEffect, event handlers, etc.). If the component only displays data, keep it as a Server Component.

#### Server Component Only (no interactivity)

```typescript
// components/info/my-info.tsx
import { getMyData } from "../../lib/queries";

export function MyInfo() {
  const data = getMyData();
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Info</CardTitle>
      </CardHeader>
      <CardContent>{/* render data */}</CardContent>
    </Card>
  );
}
```

#### With Client Component (interactivity required)

```typescript
// components/info/my-info.tsx
import { getMyData } from "../../lib/queries";
import { MyInfoClient } from "./my-info.client";

export function MyInfo() {
  const data = getMyData();
  return <MyInfoClient data={data} />;
}
```

```typescript
// components/info/my-info.client.tsx
"use client";

interface MyInfoClientProps {
  data: MyData;
}

export function MyInfoClient({ data }: MyInfoClientProps) {
  const [state, setState] = useState(/* ... */);
  return (/* interactive UI */);
}
```

## File Locations

- Pure charts: `apps/web/src/components/charts/`
- UI primitives: `apps/web/src/components/ui/`
- Data-fetching: `apps/web/src/components/info/`
- Queries: `apps/web/src/lib/queries.ts`

## Storybook Template

```typescript
// components/info/my-info.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { MyInfoClient } from "./my-info.client";

const meta = {
  component: MyInfoClient,
} satisfies Meta<typeof MyInfoClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: {
      // mock data here
    },
  },
};
```

## Semantic Colors (MUST use)

| Purpose          | Class                   |
| ---------------- | ----------------------- |
| Income amount    | `text-income`           |
| Expense amount   | `text-expense`          |
| Positive balance | `text-balance-positive` |
| Negative balance | `text-balance-negative` |
