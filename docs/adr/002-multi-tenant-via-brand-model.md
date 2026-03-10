# ADR-002: Multi-Tenant Architecture via Brand Model

## Status
Accepted

## Context
The platform needed to serve multiple white-label brands from a single deployment. Each brand has its own domain, Telegram bot, and reporting channels. Options considered:

1. **Separate databases per tenant** — strong isolation but high operational overhead for a solo operator. Each new brand would need a new database, migration pipeline, and backup process.
2. **Schema-based multi-tenancy** (PostgreSQL schemas) — moderate isolation but complex Prisma ORM integration and migration management.
3. **Row-level multi-tenancy with a Brand model** — all tenants share one database, with a `brandId` foreign key on the User model and a unique constraint on `(phone, brandId)`.

## Decision
Implement row-level multi-tenancy using a `Brand` model:

```prisma
model Brand {
  id          String @id @default(dbgenerated("gen_random_uuid()"))
  domainName  String @unique
  botToken    String
  botUsername String @unique
  User        User[]
}

model User {
  brandId String @db.Uuid
  brand   Brand? @relation(fields: [brandId], references: [id])
  @@unique([phone, brandId], name: "UserPhoneBrandIdUnique")
}
```

Brand resolution happens at the application layer:
- **Frontend** sends `domainName` (from `window.location.host`) with auth requests.
- **Backend** resolves the Brand from the domain name, then scopes user lookups to that brand.
- **Telegram** initializes one Telegraf bot instance per brand at application startup.

## Consequences

**Positive:**
- Single database, single deployment, single migration pipeline. Adding a new brand is a database insert, not a new infrastructure setup.
- Shared infrastructure cost across brands.
- Cross-brand analytics and reporting are simple SQL queries (no cross-database joins).
- Prisma migrations apply to all brands simultaneously.

**Negative:**
- No data isolation between brands at the database level. A bug in a query without proper `brandId` filtering could leak data across brands.
- The unique constraint `(phone, brandId)` means the same phone number can register under multiple brands — this is intentional (each brand is independent) but requires careful handling in admin tools.
- Telegram bot management complexity scales linearly with brand count (each brand spawns a bot instance in memory).
- No per-brand performance isolation — a heavy query from one brand affects all brands.

**Mitigation:** The `UserPhoneBrandIdUnique` constraint enforces brand isolation at the data layer. All user-facing queries include `brandId` in their where clauses, enforced by the auth flow which always resolves the brand first.
