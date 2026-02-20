# Auto-docs from Contracts

Sansao now includes an OpenAPI generator built from registered contracts.
OpenAPI is the source artifact, not the only final docs format.

## Why

- Eliminate drift between code and docs.
- Keep endpoint documentation in sync with route contracts.
- Enable automated publishing (OpenAPI + rendered docs pages).

## Current MVP

The generator consumes contracts and outputs:

- OpenAPI 3.1 JSON

```ts
import { generateOpenApi } from "sansao/docs";

const spec = generateOpenApi(app, {
  title: "My API",
  version: "1.0.0",
});
```

Current behavior:

1. Reads route metadata (`method`, `path`) from registered contracts.
2. Maps `params`, `query`, `headers`, `body`, and `response`.
3. Converts schemas via the configured validator adapter (`toJSONSchema`).
4. Supports configurable request body content types.

Notes:

- Zod works out of the box (default adapter).
- Yup/Valibot adapters include built-in JSON Schema conversion for common shapes.
- Custom schema systems can provide `toJSONSchema` through their validator adapter.
- Generated OpenAPI can be rendered by Swagger UI, Redoc, Scalar, Stoplight, or similar tools.
- `create-sansao` can scaffold `openapi.json` and `swagger.html`.

## Beyond OpenAPI

OpenAPI should be treated as the canonical machine-readable contract.
From it, you can generate and publish:

- Swagger UI static docs
- Redoc static docs
- Scalar pages
- Markdown references (via renderer/converter pipelines)

## Examples

Generate OpenAPI from scaffolded project scripts:

```bash
npm run docs:openapi
# output: docs/openapi.json
```

Generate OpenAPI + Swagger UI page (when scaffolded with `swagger` or `both`):

```bash
npm run docs:swagger
# outputs: docs/openapi.json + docs/swagger.html
```

Generate OpenAPI programmatically from app:

```ts
import { generateOpenApi } from "sansao/docs";
import { app } from "./app";

const spec = generateOpenApi(app, {
  title: "My API",
  version: "1.0.0",
});
```

Generate OpenAPI from contracts with explicit validator adapter:

```ts
import { generateOpenApi } from "sansao/docs";

const spec = generateOpenApi(contracts, {
  title: "My API",
  version: "1.0.0",
  validator: myValidatorAdapter,
});
```

Swagger UI consuming `openapi.json`:

```html
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({ url: "./openapi.json", dom_id: "#swagger-ui" });
</script>
```

Redoc consuming `openapi.json`:

```html
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
<redoc spec-url="./openapi.json"></redoc>
```

Scalar consuming `openapi.json`:

```html
<script id="api-reference" data-url="./openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
```
