const APPLE_API_PATH = /^\/v[12]\/[\w./-]+$/;

export function assertAppleApiPath(path: string): void {
  if (!APPLE_API_PATH.test(path)) {
    throw new Error(
      `Invalid Apple API path. Must match /v1/... or /v2/... (got: ${path})`,
    );
  }
  if (path.includes("..")) {
    throw new Error("Path traversal is not allowed in apple_api_call");
  }
}

// Segmentos en camelCase como los nombra googleapis (batchUpdate, migratePrices); sin otros símbolos.
const GOOGLE_RESOURCE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
// Se comparan en minúsculas (assertGoogleMethod normaliza el nombre recibido).
const lower = (names: string[]) => new Set(names.map((n) => n.toLowerCase()));

const GOOGLE_READ_METHODS = lower(["get", "list", "batchGet", "getExternalTransaction"]);
const GOOGLE_WRITE_METHODS = lower([
  "insert",
  "create",
  "update",
  "patch",
  "delete",
  "upload",
  "commit",
  "validate",
  "deobfuscate",
  "archive",
  "cancel",
  "defer",
  "revoke",
  "acknowledge",
  "batchDelete",
  "batchUpdate",
  "batchUpdateStates",
  "batchMigratePrices",
  "consume",
  "refund",
  "activate",
  "deactivate",
  "migratePrices",
  "dataSafety",
  "convertRegionPrices",
  "addexternallyhosted",
  "uploadapk",
  "uploadbundle",
  "createexternaltransaction",
  "refundexternaltransaction",
  "addTargeting",
  "deploy",
]);

export function parseGoogleResource(resource: string): string[] {
  if (!GOOGLE_RESOURCE.test(resource)) {
    throw new Error(
      `Invalid Google resource. Use dot notation like edits.tracks.list (got: ${resource})`,
    );
  }
  return resource.split(".");
}

export function assertGoogleMethod(method: string): void {
  const normalized = method.toLowerCase();
  if (
    !GOOGLE_READ_METHODS.has(normalized) &&
    !GOOGLE_WRITE_METHODS.has(normalized)
  ) {
    throw new Error(
      `Unsupported Google API method "${method}". Use a known read or write method name.`,
    );
  }
}

export function isGoogleWriteMethod(method: string): boolean {
  return !GOOGLE_READ_METHODS.has(method.toLowerCase());
}

export function isAppleWriteMethod(method: string): boolean {
  return method !== "GET";
}

export function resolveGoogleApiTarget(
  api: Record<string, unknown>,
  parts: string[],
): { target: Record<string, unknown>; methodName: string } {
  let current: Record<string, unknown> = api;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = current[parts[i]];
    if (!next || typeof next !== "object") {
      throw new Error(`Google API resource not found: ${parts.slice(0, i + 1).join(".")}`);
    }
    current = next as Record<string, unknown>;
  }
  const methodName = parts[parts.length - 1];
  if (typeof current[methodName] !== "function") {
    throw new Error(`Google API method not found: ${parts.join(".")}`);
  }
  return { target: current, methodName };
}
