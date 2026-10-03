#!/usr/bin/env node
// StorePilot — genera el CSV de Data safety (Safety Labels) de Google Play desde una declaración simple.
// Uso: node build.mjs <spec.json> > safety.csv
// spec: { encryptedInTransit, deletionRequest, dataDeletionUrl, accounts: { creationMethods: [PSL_ACM_...], deletionUrl,
//         outsideAppTypes: [PSL_LOGIN_...], outsideAppOther }, types: { PSL_EMAIL: { collected, shared, ephemeral, optional,
//         purposes: [PSL_APP_FUNCTIONALITY...], sharingPurposes: [...] } } }
// Plantilla: export oficial de Play Console (template.csv). Tipos no declarados quedan vacíos (= no recolectados).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const PURPOSES = ["PSL_APP_FUNCTIONALITY", "PSL_ANALYTICS", "PSL_DEVELOPER_COMMUNICATIONS", "PSL_FRAUD_PREVENTION_SECURITY", "PSL_ADVERTISING", "PSL_PERSONALIZATION", "PSL_ACCOUNT_MANAGEMENT"];

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const rows = parseCsv(fs.readFileSync(path.join(here, "template.csv"), "utf8"));
const known = new Set(rows.slice(1).filter((r) => r[0].startsWith("PSL_DATA_TYPES_")).map((r) => r[1]));
for (const t of Object.keys(spec.types || {})) if (!known.has(t)) throw new Error(`Tipo de dato desconocido: ${t}`);
for (const [t, d] of Object.entries(spec.types || {})) for (const p of [...(d.purposes || []), ...(d.sharingPurposes || [])]) if (!PURPOSES.includes(p)) throw new Error(`Propósito desconocido en ${t}: ${p}`);
if (Object.values(spec.types || {}).some((d) => d.collected && !(d.purposes || []).length)) throw new Error("Cada dato recolectado necesita al menos un propósito.");

const types = spec.types || {};
const anyData = Object.keys(types).length > 0;
const value = (q, r) => {
  if (q === "PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA") return String(anyData);
  if (q === "PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT") return anyData ? String(!!spec.encryptedInTransit) : "";
  if (q === "PSL_DATA_COLLECTION_USER_REQUEST_DELETE") return anyData ? String(!!spec.deletionRequest) : "";
  if (q === "PSL_DATA_COLLECTION_COMPLIES_FAMILY_POLICY") return spec.familyPolicy === undefined ? "" : String(spec.familyPolicy);
  if (q.startsWith("PSL_DATA_TYPES_")) return types[r] ? "true" : "";
  // Cuentas (preguntas añadidas por Google en 2024-2025)
  const acc = spec.accounts || {};
  if (q === "PSL_SUPPORTED_ACCOUNT_CREATION_METHODS") return (acc.creationMethods || ["PSL_ACM_NONE"]).includes(r) ? "true" : "";
  if (q === "PSL_ACM_SPECIFY") return acc.creationMethods?.includes("PSL_ACM_OTHER") ? acc.creationOther || "" : "";
  if (q === "PSL_ACCOUNT_DELETION_URL") return acc.deletionUrl || "";
  if (q === "PSL_SUPPORT_DATA_DELETION_BY_USER") return r === (spec.deletionRequest ? "DATA_DELETION_YES" : "DATA_DELETION_NO") ? "true" : "";
  if (q === "PSL_DATA_DELETION_URL") return spec.dataDeletionUrl || "";
  if (q === "PSL_HAS_OUTSIDE_APP_ACCOUNTS") return acc.outsideAppTypes === undefined ? "" : String(acc.outsideAppTypes.length > 0);
  if (q === "PSL_OUTSIDE_APP_ACCOUNT_TYPES") return (acc.outsideAppTypes || []).includes(r) ? "true" : "";
  if (q === "PSL_OUTSIDE_APP_ACCOUNT_TYPE_SPECIFY") return (acc.outsideAppTypes || []).includes("PSL_OUTSIDE_APP_ACCOUNT_TYPE_OTHER") ? acc.outsideAppOther || "" : "";
  if (q === "PSL_INDEPENDENTLY_VALIDATED" || q === "PSL_UPI_BADGE_OPT_IN") return "";
  const m = q.match(/^PSL_DATA_USAGE_RESPONSES:([A-Z_]+):([A-Z_]+)$/);
  if (!m) return "";
  const d = types[m[1]];
  if (!d) return "";
  switch (m[2]) {
    case "PSL_DATA_USAGE_COLLECTION_AND_SHARING":
      if (r === "PSL_DATA_USAGE_ONLY_COLLECTED") return d.collected ? "true" : "";
      if (r === "PSL_DATA_USAGE_ONLY_SHARED") return d.shared ? "true" : "";
      return "";
    case "PSL_DATA_USAGE_EPHEMERAL": return d.collected ? String(!!d.ephemeral) : "";
    case "DATA_USAGE_USER_CONTROL":
      if (!d.collected) return "";
      return r === (d.optional ? "PSL_DATA_USAGE_USER_CONTROL_OPTIONAL" : "PSL_DATA_USAGE_USER_CONTROL_REQUIRED") ? "true" : "";
    case "DATA_USAGE_COLLECTION_PURPOSE": return d.collected && (d.purposes || []).includes(r) ? "true" : "";
    case "DATA_USAGE_SHARING_PURPOSE": return d.shared && (d.sharingPurposes || []).includes(r) ? "true" : "";
    default: return "";
  }
};
const out = [rows[0].map(esc).join(",")];
for (const r of rows.slice(1)) { if (!r[0]) continue; r[2] = value(r[0], r[1]); out.push(r.map(esc).join(",")); }
process.stdout.write(out.join("\n") + "\n");
