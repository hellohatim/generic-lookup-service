# Lookup service documentation — automated checks

Lightweight **unit tests** (Node.js built-in `node:test`) that validate:

- [openapi.yaml](../openapi.yaml) parses as YAML and conforms to **OpenAPI 3.x** (via `@apidevtools/swagger-parser`)
- Critical paths from the product spec are present
- Postman JSON assets parse and include expected variables/folders
- MongoDB seed script has consistent demo ObjectIds and no obvious syntax errors

## Prerequisites

- **Node.js 18+** (for `node --test` and native `fetch` if you extend tests later).

## Run

```bash
cd docs/lookup-service/tools
npm install
npm test
```

From repository root (after `npm install` inside `docs/lookup-service/tools`):

```bash
npm run test:lookup-docs
```
