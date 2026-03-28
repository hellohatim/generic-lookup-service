# Authentication and tenant authorization

This document defines **JWT claims**, **tenant resolution** (path-scoped vs token-only URLs), and **roles** (`platform_admin` vs `tenant_user`) for the Generic Multi-Tenant Lookup Service. It pairs with [openapi.yaml](./openapi.yaml) and [mongodb-data-model.md](./mongodb-data-model.md).

---

## Transport

- **Header:** `Authorization: Bearer <JWT>`
- **Content-Type:** `application/json` for JSON bodies

Invalid or missing tokens → **401** with `ApiError` body (see OpenAPI `ApiError` schema).

---

## Audit and attribution (bulk import)

- Each **`lookup_import_audit`** document stores **`actorSub`** = JWT **`sub`** of the caller who submitted `POST .../imports`.
- **`lookup_table_versions.createdBy`** should use the same **`sub`** when a version is created manually or via import (see [mongodb-data-model.md](./mongodb-data-model.md)).
- Service accounts used for automation should use distinct `sub` values so audits remain attributable.

---

## Roles

| Role             | Purpose |
|------------------|--------|
| `platform_admin` | Create/list/update/delete **tenants**; may access any tenant’s data **only if** your product explicitly allows cross-tenant admin operations (recommended: separate admin API or strict audit). |
| `tenant_user`    | Manage **namespaces**, **lookup tables**, and **entries** for **one or more** tenants assigned to the user. |

Optional refinement: `tenant_admin` vs `tenant_readonly` if you need read-only API keys later.

---

## JWT claims (recommended)

Standard and custom claims should be validated on every request.

| Claim       | Type   | Required | Description |
|------------|--------|----------|-------------|
| `sub`      | string | yes      | Subject (user or service account id) |
| `iss` / `aud` | string | yes | Issuer and audience per your IdP |
| `exp` / `iat` | number | yes | Expiry and issued-at |
| `tenantId` | string | **conditional** | Single active tenant for **token-only** URL style (style B) |
| `tenantIds`| array of string | **conditional** | All tenants the principal may access (for multi-tenant users) |
| `roles`    | array of string | recommended | e.g. `["tenant_user"]` or `["platform_admin"]` |

**Issuing tokens**

- **Tenant user** with access to exactly one tenant: include `tenantId` (or a one-element `tenantIds`).
- **Tenant user** with multiple tenants: include `tenantIds`; the client **must** use **path-scoped** URLs (style A) so each request names which tenant is being acted on.
- **Platform admin:** include `platform_admin` in `roles`; `tenantId` may be omitted for `/tenants` collection operations, but **must** still be honored when operating on tenant-scoped resources (see below).

---

## Tenant resolution: path vs token

The API specification uses **explicit tenant in path** (style A):

```http
GET /lookup/v1/tenants/{tenantId}/namespaces
```

### Rules (style A — recommended baseline)

1. Parse `tenantId` from the path for all tenant-scoped routes (`/tenants/{tenantId}/...`).
2. If the principal is **`tenant_user`**:
   - `tenantId` **must** equal `tenantId` claim **or** be present in `tenantIds`.
   - Otherwise → **403** `FORBIDDEN_TENANT`.
3. If the principal is **`platform_admin`**:
   - Either allow access to **any** tenant (operator mode) or restrict with an additional claim/allowlist; document the chosen behavior. Default recommendation: **allow read/write on any tenant** for `platform_admin` only on internal networks or with mTLS.

### Optional style B (tenant from token only)

Shorter routes such as `GET /namespaces` **without** `{tenantId}`:

1. Resolve tenant from `tenantId` claim (exactly **one** tenant must be unambiguous).
2. If token has **multiple** `tenantIds` and no path → **400** unless you add a header e.g. `X-Tenant-Id` (treat as explicit scope and validate against `tenantIds`).

**Recommendation:** Implement **style A** first in the OpenAPI you publish; add style B as an alternate server base path or tag if you need shorter mobile/client URLs.

---

## Authorization matrix (summary)

| Operation                         | platform_admin | tenant_user |
|-----------------------------------|:--------------:|:-----------:|
| `POST/GET/PATCH/DELETE /tenants*` | yes            | no          |
| Namespaces / tables / entries under `/tenants/{tenantId}/...` | if policy allows | only if `{tenantId}` allowed for principal |

**Tenant suspended:** If `tenants.status === suspended`, deny mutating operations (and optionally all operations) with **403** or **423** (optional locked semantics).

---

## Rate limiting and abuse

- Apply **per-tenant** and **per-subject** (or IP) limits on entry search endpoints (regex partial match is expensive).
- Return **429** with `Retry-After` when applicable; use `ApiError` with code `RATE_LIMITED`.

---

## Optional hardening

- **mTLS** or **signed service-to-service** tokens between API gateway and lookup service.
- **ETag** + `If-Match` on `PATCH` / `DELETE` for entries (see implementation plan).
- **Audit log** collection: `who`, `tenantId`, `action`, resource ids, timestamp.
