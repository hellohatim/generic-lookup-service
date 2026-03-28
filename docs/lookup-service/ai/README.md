# AI and maintainer knowledge map

Use this folder as a **navigation index** for the lookup-service **design package**. The reference API lives in [`apps/api`](../../../apps/api); the authoritative OpenAPI file is [`apps/api/openapi.yaml`](../../../apps/api/openapi.yaml). Persistence is [mongodb-data-model.md](../mongodb-data-model.md); product UX is [ui-design.md](../ui-design.md).

## Files in this folder

| File | Use when you need to |
|------|----------------------|
| [spec-landscape.md](./spec-landscape.md) | Find which document owns a topic (auth, bulk, export, soft-delete, etc.) |
| [domain-model.md](./domain-model.md) | See entities, relationships, and lifecycle at a glance |
| [change-checklist.md](./change-checklist.md) | Apply a consistent order of edits when the spec changes |

## Quick rules

1. **OpenAPI first** — add or change paths, schemas, and descriptions in `apps/api/openapi.yaml`, then align Mongo and UI docs.
2. **Deprecation vs expiry** — `isDeprecated` alone does **not** block writes in the default product rule; **expired** means `expiresAt` is set and server now (UTC) is on or after `expiresAt` (see `info.description` in OpenAPI).
3. **Tooling** — After API changes, update [`apps/api/postman/`](../../../apps/api/postman/) and [`apps/api/scripts/seed/`](../../../apps/api/scripts/seed/) if sample data shapes change; run `npm run test:contract`.

Do not treat `.cursor/plans/` files as product spec unless the user explicitly asks to implement a plan.
