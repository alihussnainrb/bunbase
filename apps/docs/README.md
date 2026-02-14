# Bunbase Docs App

This app powers the Bunbase documentation site with Fumadocs + Next.js.

## Local development

From repo root:

```bash
bun run docs:dev
```

From this directory:

```bash
bun run dev
```

## Build and type-check

```bash
bun run type-check
bun run build
```

## OpenAPI snapshot workflow

The API reference renders from:

`content/openapi/basic-example.openapi.json`

To refresh it from a running Bunbase app:

```bash
bun run openapi:pull
```

Optional source override:

```bash
OPENAPI_SOURCE_URL=http://localhost:4000/api/openapi.json bun run openapi:pull
```

## Deployment model (Vercel)

- `main` branch deploys to `https://docs.bunbase.dev`
- `docs/v1` branch deploys to `https://v1.docs.bunbase.dev`
- PRs deploy to Vercel preview URLs automatically

## Versioning strategy

- Latest docs stay on `main`.
- Major versions are maintained on dedicated branches (`docs/v1`, future `docs/v2`, etc.).
- Backport only critical fixes to older docs branches.
