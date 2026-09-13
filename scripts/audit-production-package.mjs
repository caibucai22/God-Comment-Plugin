import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REQUIRED_PERMISSIONS = Object.freeze(["storage", "downloads"]);
const REQUIRED_MATCHES = Object.freeze([["https://www.bilibili.com/video/*"]]);
const REQUIRED_ASSET_FAMILIES = Object.freeze([
  "mascot-master",
  "bottom-ground",
  "state-generating",
  "state-failed",
  "state-saved",
  "bottom-editing",
  "bottom-generating",
  "bottom-failed",
  "bottom-generated",
  "bottom-saved",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const SOURCE_GLOBAL_NAMES = new Set(["globalThis", "window", "self"]);
const SAFE_GLOBAL_ELEMENT_CALL_NAMES = new Set(["toString"]);
const NETWORK_CONSTRUCTOR_NAMES = new Set(["XMLHttpRequest", "WebSocket", "Image"]);
const NETWORK_GLOBAL_MEMBER_NAMES = new Set(["fetch", ...NETWORK_CONSTRUCTOR_NAMES]);

export const FORBIDDEN_PRODUCTION_SOURCE_TOKENS = Object.freeze([
  "navigator.sendBeacon",
  "XMLHttpRequest",
  "WebSocket",
  "/telemetry/",
  "/analytics/",
  "/api/comment/upload",
  "ccg-telemetry-endpoint",
  "ccg-comment-upload-endpoint",
  "ccg-card-upload-endpoint",
]);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function normalizePath(root, absolutePath) {
  return relative(root, absolutePath).split(sep).join("/");
}

function resolveWithin(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }

  const resolvedPath = resolve(root, relativePath);
  if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${sep}`)) {
    throw new Error(`${label} must remain inside dist.`);
  }
  return resolvedPath;
}

async function readNonEmptyFile(root, relativePath, label) {
  const absolutePath = resolveWithin(root, relativePath, label);
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    throw new Error(`${label} '${relativePath}' is missing.`);
  }

  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new Error(`${label} '${relativePath}' must be a non-empty file.`);
  }

  return Object.freeze({ path: normalizePath(root, absolutePath), size: fileStat.size });
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function requireManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("manifest.json must contain an object.");
  }
  if (manifest.manifest_version !== 3) {
    throw new Error("manifest_version must be exactly 3.");
  }
  if (!sameJson(manifest.permissions, REQUIRED_PERMISSIONS)) {
    throw new Error("permissions must be exactly [\"storage\",\"downloads\"].");
  }
  if (Object.hasOwn(manifest, "host_permissions")) {
    throw new Error("host_permissions must be absent.");
  }
  if (!Array.isArray(manifest.content_scripts)) {
    throw new Error("content_scripts must be an array.");
  }

  const matches = manifest.content_scripts.map((contentScript) => contentScript?.matches);
  if (!sameJson(matches, REQUIRED_MATCHES)) {
    throw new Error("content-script matches must be exactly [[\"https://www.bilibili.com/video/*\"]].");
  }
}

async function inspectForbiddenSourceTokens(root, files) {
  const findings = [];
  for (const absolutePath of files) {
    const extension = extname(absolutePath).toLowerCase();
    if (extension !== ".js" && extension !== ".json") continue;

    const text = await readFile(absolutePath, "utf8");
    for (const token of FORBIDDEN_PRODUCTION_SOURCE_TOKENS) {
      if (text.includes(token)) {
        findings.push(Object.freeze({ path: normalizePath(root, absolutePath), token }));
      }
    }
    for (const request of text.matchAll(/https?:\/\/[^'"`\s)]+/g)) {
      if (/(?:collector|telemetry|upload)\./i.test(request[0])) {
        findings.push(Object.freeze({ path: normalizePath(root, absolutePath), token: `collector-endpoint:${request[0]}` }));
      }
    }
  }
  return findings;
}

function isSourceGlobalExpression(expression) {
  return ts.isIdentifier(expression) && SOURCE_GLOBAL_NAMES.has(expression.text);
}

function isStringLiteralLike(expression) {
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression);
}

function staticMemberName(expression) {
  if (ts.isIdentifier(expression) || isStringLiteralLike(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression) && isStringLiteralLike(expression.argumentExpression)) {
    return expression.argumentExpression.text;
  }
  return null;
}

function networkSinkName(expression) {
  if (ts.isIdentifier(expression)) {
    return NETWORK_GLOBAL_MEMBER_NAMES.has(expression.text) ? expression.text : null;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    if (isSourceGlobalExpression(expression.expression) && NETWORK_GLOBAL_MEMBER_NAMES.has(expression.name.text)) {
      return expression.name.text;
    }
    if (ts.isIdentifier(expression.expression) && expression.expression.text === "navigator" && expression.name.text === "sendBeacon") {
      return "sendBeacon";
    }
  }
  if (ts.isElementAccessExpression(expression)) {
    const memberName = staticMemberName(expression);
    if (isSourceGlobalExpression(expression.expression) && memberName && NETWORK_GLOBAL_MEMBER_NAMES.has(memberName)) {
      return memberName;
    }
    if (ts.isIdentifier(expression.expression) && expression.expression.text === "navigator" && memberName === "sendBeacon") {
      return "sendBeacon";
    }
  }
  return null;
}

function isFetchExpression(expression) {
  return networkSinkName(expression) === "fetch";
}

function isForbiddenDynamicGlobalCall(expression) {
  if (!ts.isElementAccessExpression(expression) || !isSourceGlobalExpression(expression.expression)) return false;
  if (!isStringLiteralLike(expression.argumentExpression)) return true;
  return expression.argumentExpression.text !== "fetch" && !SAFE_GLOBAL_ELEMENT_CALL_NAMES.has(expression.argumentExpression.text);
}

function isNetworkAliasInitializer(expression) {
  if (networkSinkName(expression)) return true;
  if (ts.isElementAccessExpression(expression) && isSourceGlobalExpression(expression.expression) && !isStringLiteralLike(expression.argumentExpression)) {
    return true;
  }
  if (!ts.isCallExpression(expression)) return false;
  const bindExpression = expression.expression;
  return (ts.isPropertyAccessExpression(bindExpression) || ts.isElementAccessExpression(bindExpression))
    && staticMemberName(bindExpression) === "bind"
    && networkSinkName(bindExpression.expression) !== null;
}

function bindingPatternCreatesNetworkAlias(name, initializer) {
  if (!ts.isObjectBindingPattern(name)) return false;
  if (ts.isIdentifier(initializer) && initializer.text === "navigator") {
    return name.elements.some((element) => staticMemberName(element.propertyName ?? element.name) === "sendBeacon");
  }
  if (isSourceGlobalExpression(initializer)) {
    return name.elements.some((element) => {
      const memberName = staticMemberName(element.propertyName ?? element.name);
      return memberName !== null && NETWORK_GLOBAL_MEMBER_NAMES.has(memberName);
    });
  }
  return false;
}

function isImageSourceAssignment(node) {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  return (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
    && staticMemberName(node.left) === "src";
}

function isAllowedImageSourceAssignment(node, sourceFile, sourceRoot) {
  const relativePath = normalizePath(sourceRoot, sourceFile.fileName);
  if (relativePath === "render/image-loader.ts") {
    return node.left.expression.getText(sourceFile) === "image" && ts.isIdentifier(node.right) && node.right.text === "url";
  }
  if (relativePath !== "ui/extension-panel.ts") return false;

  if (ts.isIdentifier(node.right)) return /Asset$/.test(node.right.text);
  if (ts.isElementAccessExpression(node.right) && ts.isIdentifier(node.right.expression)) {
    return node.right.expression.text === "illustrationAssetByState" || node.right.expression.text === "bottomAssetByState";
  }
  return ts.isPropertyAccessExpression(node.right)
    && node.right.expression.getText(sourceFile) === "model"
    && node.right.name.text === "previewUrl";
}

function isAllowedRendererImageConstruction(node, sourceFile, sourceRoot) {
  return normalizePath(sourceRoot, sourceFile.fileName) === "render/image-loader.ts"
    && networkSinkName(node.expression) === "Image"
    && (node.arguments?.length ?? 0) === 0;
}

function isAllowedRendererImageFetch(call, sourceFile, sourceRoot) {
  if (normalizePath(sourceRoot, sourceFile.fileName) !== "render/card-renderer.ts" || call.arguments.length < 1 || call.arguments.length > 2) return false;
  const target = call.arguments[0];
  const targetName = ts.isIdentifier(target) ? target.text : ts.isPropertyAccessExpression(target) ? target.name.text : "";
  if (!/(?:cover|image|asset)(?:Url)?$/i.test(targetName)) return false;
  if (call.arguments.length === 1) return true;

  const options = call.arguments[1];
  if (!ts.isObjectLiteralExpression(options)) return false;
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property) || !property.name) return false;
    const name = property.name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
    if (name === "body" || name === "credentials" || name === "headers" || name === "keepalive") return false;
    if (name === "method" && (!ts.isStringLiteral(property.initializer) || property.initializer.text.toUpperCase() !== "GET")) return false;
  }
  return true;
}

async function inspectSourceNetworkCalls(sourceRoot) {
  const findings = [];
  const sourceFiles = await listFiles(sourceRoot);
  for (const absolutePath of sourceFiles) {
    if (![".ts", ".tsx", ".mts", ".cts"].includes(extname(absolutePath).toLowerCase())) continue;
    const sourceText = await readFile(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      const path = `src/${normalizePath(sourceRoot, absolutePath)}`;
      if (ts.isCallExpression(node) && isFetchExpression(node.expression) && !isAllowedRendererImageFetch(node, sourceFile, sourceRoot)) {
        findings.push(Object.freeze({ path, token: "source-fetch" }));
      }
      if (ts.isCallExpression(node) && isForbiddenDynamicGlobalCall(node.expression)) {
        findings.push(Object.freeze({ path, token: "source-dynamic-global-call" }));
      }
      if (ts.isCallExpression(node) && networkSinkName(node.expression) === "sendBeacon") {
        findings.push(Object.freeze({ path, token: "navigator.sendBeacon" }));
      }
      if (ts.isCallExpression(node)) {
        const sinkName = networkSinkName(node.expression);
        if (sinkName && sinkName !== "fetch" && sinkName !== "sendBeacon") {
          findings.push(Object.freeze({ path, token: `source-${sinkName}` }));
        }
      }
      if (ts.isVariableDeclaration(node) && node.initializer
        && (isNetworkAliasInitializer(node.initializer) || bindingPatternCreatesNetworkAlias(node.name, node.initializer))) {
        findings.push(Object.freeze({ path, token: "source-network-alias" }));
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && isNetworkAliasInitializer(node.right)) {
        findings.push(Object.freeze({ path, token: "source-network-alias" }));
      }
      if (ts.isNewExpression(node) && networkSinkName(node.expression)
        && !isAllowedRendererImageConstruction(node, sourceFile, sourceRoot)) {
        findings.push(Object.freeze({ path, token: `source-${networkSinkName(node.expression)}` }));
      }
      if (isImageSourceAssignment(node) && !isAllowedImageSourceAssignment(node, sourceFile, sourceRoot)) {
        findings.push(Object.freeze({ path, token: "source-image-src" }));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings;
}

function findAssetFamily(root, files, family) {
  const prefix = `${family}-`;
  return files.find((absolutePath) => {
    const fileName = basename(absolutePath).toLowerCase();
    return fileName.startsWith(prefix) && IMAGE_EXTENSIONS.has(extname(fileName));
  }) ?? null;
}

/**
 * Audit a final Vite production directory without writing to it.
 *
 * @param {{ distDir?: string }} [options]
 */
export async function auditProductionPackage(options = {}) {
  const distDir = options.distDir ?? resolve(process.cwd(), "dist");
  const projectRoot = options.projectRoot ?? PROJECT_ROOT;
  const sourceDir = options.sourceDir ?? resolve(projectRoot, "src");
  const root = resolve(distDir);
  const manifestRecord = await readNonEmptyFile(root, "manifest.json", "manifest");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  } catch (error) {
    throw new Error(`manifest.json must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  requireManifestShape(manifest);

  const contentScripts = [];
  for (const contentScript of manifest.content_scripts) {
    if (!Array.isArray(contentScript.js) || contentScript.js.length === 0) {
      throw new Error("content_scripts entries must declare at least one JavaScript file.");
    }
    for (const scriptPath of contentScript.js) {
      contentScripts.push(await readNonEmptyFile(root, scriptPath, "content script"));
    }
    if (contentScript.css !== undefined && !Array.isArray(contentScript.css)) {
      throw new Error("content_scripts css entries must be arrays when declared.");
    }
    for (const stylesheetPath of contentScript.css ?? []) {
      contentScripts.push(await readNonEmptyFile(root, stylesheetPath, "content stylesheet"));
    }
  }

  const emittedFiles = await listFiles(root);
  const requiredAssets = REQUIRED_ASSET_FAMILIES.map((family) => {
    const assetPath = findAssetFamily(root, emittedFiles, family);
    if (!assetPath) throw new Error(`required pixel asset family '${family}' is missing.`);
    return assetPath;
  });
  const assetRecords = await Promise.all(requiredAssets.map(async (assetPath) => {
    const normalizedPath = normalizePath(root, assetPath);
    return readNonEmptyFile(root, normalizedPath, "required pixel asset");
  }));

  const sourceNetworkFindings = await inspectSourceNetworkCalls(resolve(sourceDir));
  if (sourceNetworkFindings.length > 0) {
    throw new Error(`source-level network call found: ${sourceNetworkFindings.map((finding) => `${finding.token} in ${finding.path}`).join(", ")}.`);
  }
  const forbiddenPatternFindings = await inspectForbiddenSourceTokens(root, emittedFiles);
  if (forbiddenPatternFindings.length > 0) {
    throw new Error(`forbidden production network pattern found: ${forbiddenPatternFindings.map((finding) => `${finding.token} in ${finding.path}`).join(", ")}.`);
  }

  return freeze({
    manifestVersion: manifest.manifest_version,
    matches: manifest.content_scripts.map((contentScript) => [...contentScript.matches]),
    permissions: [...manifest.permissions],
    requiredFiles: [manifestRecord, ...contentScripts, ...assetRecords],
    forbiddenPatternFindings,
  });
}

async function runCli() {
  try {
    const result = await auditProductionPackage();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Production package audit failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
