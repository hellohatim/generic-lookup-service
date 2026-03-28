# Change checklist (spec edits)

Use this when adding or changing API behavior so documentation and tooling stay aligned.

## 1. API contract

- [ ] Edit [openapi.yaml](../openapi.yaml): paths, parameters, schemas, `info.description`, response examples.
- [ ] If auth or tenancy rules change, update [auth-tenant.md](../auth-tenant.md).

## 2. Persistence

- [ ] Edit [mongodb-data-model.md](../mongodb-data-model.md): fields, indexes, behavior notes (search, import, cursor sort).

## 3. Product copy / UX

- [ ] Edit [ui-design.md](../ui-design.md) if user-visible behavior, errors, or flows change.
- [ ] Edit [README.md](../README.md) glossary or summaries if concepts move.

## 4. Observability (optional)

- [ ] Edit [observability.md](../observability.md) if new operations warrant log fields or metrics.

## 5. Samples and agent navigation

- [ ] Update Postman requests in [postman/](../postman/) (paths, bodies, variables).
- [ ] Update [scripts/seed/](../scripts/seed/) if collection shapes or demo IDs change; refresh seed README IDs for Postman.
- [ ] Update [spec-landscape.md](./spec-landscape.md) if ownership of a topic shifts.

## 6. Sanity

- [ ] Run **`docs/lookup-service/tools`** tests: `npm install` then `npm test` (Node 18+), or `npm run test:lookup-docs` from repo root.
- [ ] Do not modify `.cursor/plans/` as product documentation.
