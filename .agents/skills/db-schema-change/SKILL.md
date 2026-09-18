---
name: db-schema-change
description: Use when adding/modifying database tables or columns in Drizzle ORM schema
---

# DB Schema Change Skill

## Checklist (MUST complete all)

- [ ] Add `createdAt: text("created_at").notNull()` to new tables
- [ ] Add `updatedAt: text("updated_at").notNull()` to new tables
- [ ] Specify `onDelete` for all foreign keys (cascade/set null)
- [ ] Add index for frequently queried columns
- [ ] Update `packages/db/src/schema/relations.ts` if adding relations
- [ ] Run migration: `pnpm --filter @mf-dashboard/db exec drizzle-kit generate`
- [ ] Update `docs/architecture/database-schema.md` with new ERD

## File Locations

- Schema: `packages/db/src/schema/tables.ts`
- Relations: `packages/db/src/schema/relations.ts`
- Repositories: `packages/db/src/repositories/`
- Types: `packages/db/src/types.ts`

## Template

```typescript
export const newTable = sqliteTable("new_table", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // ... your columns ...
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

## Foreign Key Template

```typescript
foreignKeyColumn: integer("foreign_key_column")
  .notNull()
  .references(() => parentTable.id, { onDelete: "cascade" }),
```

## Index Template

```typescript
export const myTable = sqliteTable(
  "my_table",
  {
    // columns...
  },
  (table) => [index("my_table_column_idx").on(table.columnName)],
);
```
