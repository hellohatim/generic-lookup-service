# @lookup/web — Lookup admin UI

Angular 19 + Angular Material. Calls the REST API under **`/lookup/v1`** using a **dev-server proxy** (no CORS setup required locally).

## Prerequisites

- Node.js 20+
- API running on **`http://127.0.0.1:3000`** (default `npm run dev` in `@lookup/api`)

## Commands

From repo root (workspace):

```bash
npm install
npm run dev:web
```

Or from `apps/web`:

```bash
npm install
npm start
```

Open **`http://localhost:4200`**. The proxy ([`proxy.conf.json`](./proxy.conf.json)) forwards `/lookup/v1` to the API.

Production build:

```bash
npm run build
```

Unit tests (Karma; requires a local Chrome install):

```bash
npm test
```

## Screens → API

| Area | HTTP |
|------|------|
| Tenants | `GET/POST /tenants` |
| Namespaces | `GET/POST .../tenants/{id}/namespaces` |
| Tables | `GET/POST .../namespaces/{id}/tables` |
| Entries | `GET .../tables/{id}/entries`, `POST/PATCH/DELETE .../entries`, `GET .../versions`, `GET .../exports` |

## Product UX

See [`docs/lookup-service/ui-design.md`](../../docs/lookup-service/ui-design.md). This MVP covers tenants → namespaces → tables → entries, filters, export (**wide** / **kv** / **flat_object**), and JSON entry editor. **Phase 2** (per ui-design): Excel import, bulk JSON, import audits, `POST .../versions`, advanced `query` search UI.

## Environments

[`src/environments/environment.ts`](./src/environments/environment.ts) sets `apiPrefix: '/lookup/v1'`. Development build replaces with [`environment.development.ts`](./src/environments/environment.development.ts) (same values today). For production behind another host, point `apiPrefix` at your API origin or keep a reverse proxy path.
