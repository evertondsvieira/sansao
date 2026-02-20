# create-sansao

Scaffold a new Sansao project.

## Usage

```bash
npm create sansao@latest my-api
```

Equivalent:

```bash
npx create-sansao@latest my-api
```

Options:

```bash
npx create-sansao@latest --help
npx create-sansao@latest --version
```

Options:

```bash
npx create-sansao@latest my-api --validator zod --docs openapi
npx create-sansao@latest my-api --validator yup --docs swagger
npx create-sansao@latest my-api --validator valibot --docs both
```

- `--validator`: `zod` | `yup` | `valibot`
- `--docs`: `none` | `openapi` | `swagger` | `both`

If omitted in interactive terminals, the CLI prompts for both choices.
