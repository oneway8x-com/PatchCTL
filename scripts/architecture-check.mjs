import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const appSrc = path.join(repoRoot, "apps", "app", "src");
const appRoutes = path.join(repoRoot, "apps", "app", "app");
const modulesDir = path.join(repoRoot, "packages", "modules");

const violations = [];

function listFiles(dir, exts) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (["node_modules", "dist", "build", ".next"].includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath, exts));
      continue;
    }

    if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }

  return results;
}

function extractImports(source) {
  const imports = [];
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let match;

  while ((match = importRegex.exec(source))) {
    imports.push(match[1]);
  }

  while ((match = requireRegex.exec(source))) {
    imports.push(match[1]);
  }

  return imports;
}

function addViolation(filePath, message) {
  violations.push(`${path.relative(repoRoot, filePath)}: ${message}`);
}

function checkAppBoundaries() {
  const files = [
    ...listFiles(appSrc, [".ts", ".tsx"]),
    ...listFiles(appRoutes, [".ts", ".tsx"]),
  ];

  for (const filePath of files) {
    const rel = path.relative(appSrc, filePath);
    const source = fs.readFileSync(filePath, "utf8");
    const imports = extractImports(source);

    if (rel.startsWith(`shared${path.sep}`)) {
      for (const spec of imports) {
        if (spec.startsWith("@/modules/")) {
          addViolation(filePath, "shared/* must not import from modules/*");
        }
      }
    }

    if (rel.startsWith(`modules${path.sep}`)) {
      const [, currentModule] = rel.split(path.sep);

      for (const spec of imports) {
        const match = spec.match(/^@\/modules\/([^/]+)(?:\/(.+))?$/);
        if (!match) {
          continue;
        }

        const target = match[1];
        const rest = match[2];

        if (target !== currentModule && rest && rest !== "index") {
          addViolation(
            filePath,
            `module-to-module deep import detected: ${spec}`,
          );
        }
      }
    }
  }
}

function checkModulePackages() {
  const files = listFiles(modulesDir, [".ts", ".tsx"]);

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const imports = extractImports(source);

    for (const spec of imports) {
      if (
        spec.startsWith("next/") ||
        spec.startsWith("react") ||
        spec.startsWith("@/")
      ) {
        addViolation(
          filePath,
          `shared module package must stay framework-free: ${spec}`,
        );
      }
    }
  }
}

checkAppBoundaries();
checkModulePackages();
checkPatchctlClientBoundaries();

function checkPatchctlClientBoundaries() {
  const portableRoot = path.join(repoRoot, "packages", "api-client", "src");
  const clientRoots = [
    portableRoot,
    path.join(repoRoot, "apps", "cli", "src"),
    path.join(appSrc, "modules", "patches"),
    path.join(repoRoot, "packages", "contracts", "src", "patches"),
  ];
  for (const root of clientRoots) {
    for (const file of listFiles(root, [".ts", ".tsx"])) {
      if (file.endsWith(".test.ts")) continue;
      for (const spec of extractImports(fs.readFileSync(file, "utf8"))) {
        if (
          /^@corely\/(data|modules-)/.test(spec) ||
          spec.startsWith("@prisma/") ||
          spec === "pg"
        )
          addViolation(
            file,
            `client/contracts must not import server code (including types): ${spec}`,
          );
        if (
          root === portableRoot &&
          (/^(node:|next(?:\/|$)|react(?:\/|$))/.test(spec) ||
            spec.startsWith("@corely/auth-client"))
        )
          addViolation(
            file,
            `portable API client must not depend on runtime/auth adapters: ${spec}`,
          );
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Architecture check passed.");
