# ADR-005: Static Export Frontend with Client-Side Data Fetching

## Status
Accepted

## Context
The frontend is a Next.js application. Next.js supports three rendering strategies:

1. **Server-Side Rendering (SSR)** — renders on each request. Requires a Node.js server in production.
2. **Static Site Generation (SSG)** — pre-renders at build time. Suitable for content that doesn't change between users.
3. **Static Export with Client-Side Rendering** — exports static HTML/JS files. All data fetching happens in the browser.

The application is a user dashboard where every page shows personalized data (user's packages, balance, customers). There is no public-facing content that benefits from SEO or pre-rendering.

## Decision
Use Next.js static export (`output: 'export'`) with client-side data fetching via Apollo Client:

- **Build**: `next build` produces a static `out/` directory with HTML, JS, and CSS files.
- **Deploy**: `rsync` the `out/` directory to the production server. Restart Nginx.
- **Runtime**: No Node.js process. Nginx serves static files with SPA fallback routing.
- **Data**: All API calls happen client-side through Apollo Client to the GraphQL endpoint.
- **Caching**: Static assets under `/_next/` get `Cache-Control: immutable` with 1-year expiry. HTML files get `no-cache` to ensure users always load the latest version.

## Consequences

**Positive:**
- **Operational simplicity**: No Node.js server to manage, monitor, or restart. Deployment is copying files.
- **Resilience**: The frontend cannot crash — it's static files served by Nginx. Only the API can fail.
- **Performance**: Nginx serves static files with gzip compression and aggressive caching. First-load performance limited only by JS bundle size.
- **Cost**: Zero additional compute for the frontend. Nginx was already running as the reverse proxy.
- **Deployment speed**: rsync of pre-built files is near-instant. No container builds for the frontend.

**Negative:**
- **No SEO**: Pages are empty HTML until JavaScript executes and fetches data. Not an issue for this application (authenticated dashboard, not public content).
- **Initial load**: Users see a brief loading state while Apollo Client fetches data. Mitigated by Apollo cache persistence — returning users render from cached data immediately.
- **No server-side redirects**: Auth redirects happen client-side. An unauthenticated user briefly sees the page before being redirected to login.
- **SPA routing complexity**: Nginx needs `try_files` with SPA fallback to handle client-side routes. Query string preservation required careful configuration.

**Trade-off assessment:** For an authenticated dashboard application with a single developer managing infrastructure, eliminating the frontend server runtime was a significant operational simplification. The SEO trade-off is irrelevant since no pages need to be indexed.
