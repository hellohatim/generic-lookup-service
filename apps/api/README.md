# @lookup/api

Express + TypeScript implementation; HTTP contract: [`openapi.yaml`](./openapi.yaml) (mounted by `express-openapi-validator`).

```bash
cp .env.example .env   # set MONGODB_URI if not using default
npm run dev            # http://localhost:3000/lookup/v1
npm run test
npm run test:contract  # OpenAPI validate + Postman/seed asset checks
npm run test:functional
```

See [`docs/lookup-service/implementation.md`](../../docs/lookup-service/implementation.md).
