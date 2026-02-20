import fs from "node:fs";
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
fs.writeFileSync(outputPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

console.log(`OpenAPI spec generated at ${outputPath}`);
