# ADR-004: GraphQL Over REST API

## Status
Accepted

## Context
The platform needed an API to serve a Next.js frontend and potentially other clients (Telegram bot already communicates directly with services). The data model is deeply relational: a single dashboard view might need user info, their packages, each package's server, the server's stats, payment history, and promotion details — all in one request.

Options considered:

1. **REST API** — conventional, well-understood. Would require multiple endpoints and either over-fetching (fat endpoints) or under-fetching (multiple round trips). Endpoint count estimated at 30+ given the number of mutations and query variations.
2. **GraphQL** — single endpoint, client specifies exact data shape needed. Requires more upfront setup (schema, resolvers, code generation) but reduces API surface area complexity.

## Decision
Use GraphQL (Apollo Server) with code generation for both backend and frontend:

- **Backend**: NestJS `@nestjs/graphql` with Apollo Driver. Resolvers use decorators for schema definition (code-first approach). Type safety via Prisma-generated types flowing into GraphQL output types.
- **Frontend**: `@graphql-codegen/cli` generates TypeScript types and React Apollo hooks from `.graphql` operation files. The `near-operation-file` preset places generated hooks alongside their queries/mutations.

GraphQL schema is defined code-first using NestJS decorators:
```typescript
@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field(() => [UserPackage])
  userPackage: UserPackage[];
}
```

## Consequences

**Positive:**
- The frontend fetches exactly the data it needs per page. The dashboard page queries user, packages, stats, and brand info in a single request.
- Type safety spans the full stack: Prisma schema → NestJS model → GraphQL schema → codegen → TypeScript hooks. A schema change surfaces compile errors in the frontend.
- Reduced API surface — one endpoint (`/graphql`) instead of 30+ REST routes.
- Built-in introspection and playground for development.
- Relay-style cursor pagination (via `@devoxa/prisma-relay-cursor-connection`) integrates naturally with GraphQL connection patterns.

**Negative:**
- Higher initial setup cost compared to REST (GraphQL module config, resolver boilerplate, codegen pipeline).
- Caching is more complex than REST (no HTTP-level caching by URL, need Apollo Client's normalized cache).
- File uploads require special handling (`graphql-upload` middleware), not as straightforward as REST multipart.
- Error handling semantics differ from REST (200 status code with errors in the response body).
- Query complexity can be unbounded if not properly controlled (no depth/complexity limiting configured).

**Mitigation:** The file upload issue is handled by `graphql-upload` middleware with a 10MB limit. The type safety benefit (catching frontend-backend mismatches at compile time) has been the single largest productivity advantage for a solo developer maintaining both codebases.
