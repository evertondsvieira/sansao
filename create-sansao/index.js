#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
  console.log(`
create-sansao - Create a new Sansao project

Usage:
  npm create sansao@latest <project-name>
  npx create-sansao@latest <project-name>

Options:
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

function updateTemplatePackageJson(projectDir, projectName) {
  const packageJsonPath = path.join(projectDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  packageJson.name = toPackageName(projectName);
  writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function scaffold(projectName) {
  const projectDir = path.resolve(process.cwd(), projectName);
  const templateDir = path.join(__dirname, "template");

  ensureEmptyProjectDir(projectDir);
  copyDir(templateDir, projectDir);
  updateTemplatePackageJson(projectDir, projectName);

  return { projectDir, projectName };
}

function main() {
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

  const argProjectName = args[0];

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

    scaffold(projectName);
    console.log(`🦁📋 Sansao project '${projectName}' created successfully.`);
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
