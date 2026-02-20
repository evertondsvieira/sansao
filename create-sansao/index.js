#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VALIDATOR_OPTIONS = ["zod", "yup", "valibot"];
const DOCS_OPTIONS = ["none", "openapi", "swagger", "both"];

function printUsage() {
  console.log(`
create-sansao - Create a new Sansao project

Usage:
  npm create sansao@latest <project-name>
  npx create-sansao@latest <project-name>

Options:
  --validator <zod|yup|valibot>  Validation library for the starter project
  --docs <none|openapi|swagger|both>  Documentation artifacts to scaffold
  -h, --help     Show this help message
  -v, --version  Show current version
`);
}

function toPackageName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function ensureEmptyProjectDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const items = fs.readdirSync(dirPath);
  if (items.length > 0) {
    throw new Error(`Target directory is not empty: ${dirPath}`);
  }
}

function writeFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeTemplateApp(projectDir, validator) {
  const appPath = path.join(projectDir, "src", "app.ts");
  writeFile(appPath, renderAppFile(validator));
}

function configureTemplateDocs(projectDir, docsMode) {
  const openApiPath = path.join(projectDir, "src", "generate-openapi.ts");
  const swaggerPath = path.join(projectDir, "src", "generate-swagger.ts");

  const needsOpenApi = docsMode === "openapi" || docsMode === "swagger" || docsMode === "both";
  const needsSwagger = docsMode === "swagger" || docsMode === "both";

  if (needsOpenApi) {
    writeFile(openApiPath, renderOpenApiGeneratorFile());
  } else if (fs.existsSync(openApiPath)) {
    fs.unlinkSync(openApiPath);
  }

  if (needsSwagger) {
    writeFile(swaggerPath, renderSwaggerGeneratorFile());
  } else if (fs.existsSync(swaggerPath)) {
    fs.unlinkSync(swaggerPath);
  }
}

function updateTemplatePackageJson(projectDir, projectName, validator, docsMode) {
  const packageJsonPath = path.join(projectDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  packageJson.name = toPackageName(projectName);
  packageJson.scripts = {
    dev: "node --watch --experimental-strip-types src/index.ts",
    start: "node --experimental-strip-types src/index.ts",
    build: "tsc -p tsconfig.json",
  };

  if (docsMode === "openapi") {
    packageJson.scripts["docs:openapi"] = "node --experimental-strip-types src/generate-openapi.ts";
    packageJson.scripts.docs = "npm run docs:openapi";
  } else if (docsMode === "swagger" || docsMode === "both") {
    packageJson.scripts["docs:openapi"] = "node --experimental-strip-types src/generate-openapi.ts";
    packageJson.scripts["docs:swagger"] =
      "npm run docs:openapi && node --experimental-strip-types src/generate-swagger.ts";
    packageJson.scripts.docs = "npm run docs:swagger";
  }

  packageJson.dependencies = {
    sansao: "latest",
  };

  if (validator === "zod") {
    packageJson.dependencies.zod = "^4.3.6";
  } else if (validator === "yup") {
    packageJson.dependencies.yup = "latest";
  } else if (validator === "valibot") {
    packageJson.dependencies.valibot = "latest";
  }

  packageJson.devDependencies = {
    "@types/node": "^24.0.0",
    typescript: "^5.9.3",
  };

  writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function updateTemplateReadme(projectDir, validator, docsMode) {
  const readmePath = path.join(projectDir, "README.md");
  writeFile(readmePath, renderTemplateReadme(validator, docsMode));
}

function scaffold(projectName, validator, docsMode) {
  const projectDir = path.resolve(process.cwd(), projectName);
  const templateDir = path.join(__dirname, "template");

  ensureEmptyProjectDir(projectDir);
  copyDir(templateDir, projectDir);
  writeTemplateApp(projectDir, validator);
  configureTemplateDocs(projectDir, docsMode);
  updateTemplatePackageJson(projectDir, projectName, validator, docsMode);
  updateTemplateReadme(projectDir, validator, docsMode);

  return { projectDir, projectName, validator, docsMode };
}

function parseArgs(args) {
  let projectName;
  let validator;
  let docsMode;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--validator") {
      validator = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--validator=")) {
      validator = arg.slice("--validator=".length);
      continue;
    }
    if (arg === "--docs") {
      docsMode = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--docs=")) {
      docsMode = arg.slice("--docs=".length);
      continue;
    }
    if (!arg.startsWith("-") && !projectName) {
      projectName = arg;
    }
  }

  return { projectName, validator, docsMode };
}

function validateOption(name, value, accepted) {
  if (value === undefined) {
    return;
  }
  if (!accepted.includes(value)) {
    throw new Error(`Invalid ${name}: '${value}'. Allowed values: ${accepted.join(", ")}`);
  }
}

async function chooseFromPrompt(label, accepted, defaultValue) {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = (
        await rl.question(`${label} (${accepted.join("/")}) [${defaultValue}]: `)
      ).trim();
      const value = answer === "" ? defaultValue : answer;
      if (accepted.includes(value)) {
        return value;
      }
      console.log(`Invalid value '${value}'. Allowed values: ${accepted.join(", ")}`);
    }
  } finally {
    rl.close();
  }
}

async function resolveScaffoldChoices(parsedArgs) {
  validateOption("validator", parsedArgs.validator, VALIDATOR_OPTIONS);
  validateOption("docs", parsedArgs.docsMode, DOCS_OPTIONS);

  let validator = parsedArgs.validator;
  let docsMode = parsedArgs.docsMode;

  const canPrompt = process.stdin.isTTY && process.stdout.isTTY;
  if (!validator) {
    validator = canPrompt
      ? await chooseFromPrompt("Validator", VALIDATOR_OPTIONS, "zod")
      : "zod";
  }
  if (!docsMode) {
    docsMode = canPrompt
      ? await chooseFromPrompt("Docs", DOCS_OPTIONS, "openapi")
      : "openapi";
  }

  return { validator, docsMode };
}

function renderAppFile(validator) {
  if (validator === "yup") {
    return `import { createApp, contract, defineHandler } from "sansao";
import { createYupValidatorAdapter } from "sansao/validators";
import * as yup from "yup";

const healthResponse = yup
  .object({
    ok: yup.boolean().required(),
  })
  .required();

const health = contract.get("/health", {
  response: {
    200: healthResponse,
  },
  meta: {
    summary: "Health check",
    description: "Returns service health state.",
  },
});

export const app = createApp({
  responseValidation:
    process.env.NODE_ENV === "production" ? "off" : "development",
  validator: createYupValidatorAdapter(yup),
});

app.register(
  defineHandler(health, async (ctx) => {
    return ctx.json(200, { ok: true });
  })
);
`;
  }

  if (validator === "valibot") {
    return `import { createApp, contract, defineHandler } from "sansao";
import { createValibotValidatorAdapter } from "sansao/validators";
import * as v from "valibot";

const healthResponse = v.object({
  ok: v.boolean(),
});

const health = contract.get("/health", {
  response: {
    200: healthResponse,
  },
  meta: {
    summary: "Health check",
    description: "Returns service health state.",
  },
});

export const app = createApp({
  responseValidation:
    process.env.NODE_ENV === "production" ? "off" : "development",
  validator: createValibotValidatorAdapter(v),
});

app.register(
  defineHandler(health, async (ctx) => {
    return ctx.json(200, { ok: true });
  })
);
`;
  }

  return `import { createApp, contract, defineHandler, z } from "sansao";

const health = contract.get("/health", {
  response: {
    200: z.object({ ok: z.boolean() }),
  },
  meta: {
    summary: "Health check",
    description: "Returns service health state.",
  },
});

export const app = createApp({
  responseValidation:
    process.env.NODE_ENV === "production" ? "off" : "development",
});

app.register(
  defineHandler(health, async (ctx) => {
    return ctx.json(200, { ok: true });
  })
);
`;
}

function renderOpenApiGeneratorFile() {
  return `import fs from "node:fs";
import path from "node:path";
import { generateOpenApi } from "sansao/docs";
import { app } from "./app.ts";

const spec = generateOpenApi(app, {
  title: "Sansao API",
  version: "1.0.0",
  servers: [{ url: "http://localhost:3000" }],
});

const outputDir = path.resolve(process.cwd(), "docs");
const outputPath = path.join(outputDir, "openapi.json");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, \`\${JSON.stringify(spec, null, 2)}\\n\`, "utf8");

console.log(\`OpenAPI spec generated at \${outputPath}\`);
`;
}

function renderSwaggerGeneratorFile() {
  return `import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve(process.cwd(), "docs");
const outputPath = path.join(outputDir, "swagger.html");

const html = \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "./openapi.json",
        dom_id: "#swagger-ui",
      });
    </script>
  </body>
</html>
\`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, \`\${html}\\n\`, "utf8");

console.log(\`Swagger UI page generated at \${outputPath}\`);
`;
}

function renderTemplateReadme(validator, docsMode) {
  const lines = [
    "# create-sansao",
    "",
    "Scaffold a new Sansao project with one command.",
    "",
    "## Usage",
    "",
    "```bash",
    "npm create sansao@latest my-api",
    "cd my-api",
    "npm install",
    "npm run dev",
    "```",
    "",
    "Server starts at `http://localhost:3000`.",
    "",
    `Validator configured: \`${validator}\`.`,
  ];

  if (docsMode === "none") {
    lines.push("", "Docs scaffolding: `none`.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("", `Docs scaffolding: \`${docsMode}\`.`);
  lines.push("", "## Generate API Docs");
  lines.push("", "```bash");
  if (docsMode === "openapi") {
    lines.push("npm run docs:openapi");
    lines.push("```", "", "This writes `docs/openapi.json` from your registered Sansao contracts.");
  } else {
    lines.push("npm run docs:swagger");
    lines.push("```", "", "This writes `docs/openapi.json` and `docs/swagger.html`.");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("-v") || args.includes("--version")) {
    const packageJson = readJson(path.join(__dirname, "package.json"));
    console.log(packageJson.version);
    process.exit(0);
  }

  const parsedArgs = parseArgs(args);
  const argProjectName = parsedArgs.projectName;

  if (!argProjectName) {
    console.error("🦁📋 Sansao project generator");
    printUsage();
    process.exit(1);
  }

  try {
    const projectName = argProjectName.trim();
    const packageName = toPackageName(projectName);

    if (!projectName || !packageName) {
      throw new Error("Invalid project name.");
    }

    if (fs.existsSync(path.resolve(process.cwd(), projectName))) {
      throw new Error(`Directory already exists: ${projectName}`);
    }

    const { validator, docsMode } = await resolveScaffoldChoices(parsedArgs);
    scaffold(projectName, validator, docsMode);
    console.log(`🦁📋 Sansao project '${projectName}' created successfully.`);
    console.log(`Validator: ${validator}`);
    console.log(`Docs: ${docsMode}`);
    console.log("");
    console.log("Next steps:");
    console.log(`  cd ${projectName}`);
    console.log("  npm install");
    console.log("  npm run dev");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
