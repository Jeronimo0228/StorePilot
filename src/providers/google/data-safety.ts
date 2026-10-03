import { DATA_SAFETY_TEMPLATE } from "./data-safety-template.js";

/** Declaración simple de Data safety; se convierte al CSV de Safety Labels que exige la API. */
export interface DataSafetySpec {
  encryptedInTransit?: boolean;
  deletionRequest?: boolean;
  dataDeletionUrl?: string;
  familyPolicy?: boolean;
  accounts?: {
    creationMethods?: string[];
    creationOther?: string;
    deletionUrl?: string;
    outsideAppTypes?: string[];
    outsideAppOther?: string;
  };
  types?: Record<
    string,
    { collected?: boolean; shared?: boolean; ephemeral?: boolean; optional?: boolean; purposes?: string[]; sharingPurposes?: string[] }
  >;
}

const PURPOSES = [
  "PSL_APP_FUNCTIONALITY",
  "PSL_ANALYTICS",
  "PSL_DEVELOPER_COMMUNICATIONS",
  "PSL_FRAUD_PREVENTION_SECURITY",
  "PSL_ADVERTISING",
  "PSL_PERSONALIZATION",
  "PSL_ACCOUNT_MANAGEMENT",
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildDataSafetyCsv(spec: DataSafetySpec): string {
  const rows = parseCsv(DATA_SAFETY_TEMPLATE);
  const types = spec.types ?? {};
  const known = new Set(rows.slice(1).filter((r) => r[0]?.startsWith("PSL_DATA_TYPES_")).map((r) => r[1]));
  for (const [t, d] of Object.entries(types)) {
    if (!known.has(t)) throw new Error(`Unknown data type: ${t}`);
    for (const p of [...(d.purposes ?? []), ...(d.sharingPurposes ?? [])]) if (!PURPOSES.includes(p)) throw new Error(`Unknown purpose in ${t}: ${p}`);
    if (d.collected && !(d.purposes ?? []).length) throw new Error(`${t}: collected data needs at least one purpose`);
  }
  const any = Object.keys(types).length > 0;
  const acc = spec.accounts ?? {};
  const value = (q: string, r: string): string => {
    if (q === "PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA") return String(any);
    if (q === "PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT") return any ? String(!!spec.encryptedInTransit) : "";
    if (q === "PSL_DATA_COLLECTION_USER_REQUEST_DELETE") return any ? String(!!spec.deletionRequest) : "";
    if (q === "PSL_DATA_COLLECTION_COMPLIES_FAMILY_POLICY") return spec.familyPolicy === undefined ? "" : String(spec.familyPolicy);
    if (q.startsWith("PSL_DATA_TYPES_")) return types[r] ? "true" : "";
    if (q === "PSL_SUPPORTED_ACCOUNT_CREATION_METHODS") return (acc.creationMethods ?? ["PSL_ACM_NONE"]).includes(r) ? "true" : "";
    if (q === "PSL_ACM_SPECIFY") return acc.creationMethods?.includes("PSL_ACM_OTHER") ? acc.creationOther ?? "" : "";
    // Sin creación de cuentas en la app, Google no admite la URL de borrado de cuenta.
    if (q === "PSL_ACCOUNT_DELETION_URL") return (acc.creationMethods ?? ["PSL_ACM_NONE"]).includes("PSL_ACM_NONE") ? "" : acc.deletionUrl ?? "";
    if (q === "PSL_SUPPORT_DATA_DELETION_BY_USER") return r === (spec.deletionRequest ? "DATA_DELETION_YES" : "DATA_DELETION_NO") ? "true" : "";
    if (q === "PSL_DATA_DELETION_URL") return spec.dataDeletionUrl ?? "";
    // Google solo admite esta pregunta cuando la app no permite crear cuentas.
    if (q === "PSL_HAS_OUTSIDE_APP_ACCOUNTS") return acc.outsideAppTypes === undefined ? "" : String(acc.outsideAppTypes.length > 0);
    if (q === "PSL_OUTSIDE_APP_ACCOUNT_TYPES") return (acc.outsideAppTypes ?? []).includes(r) ? "true" : "";
    if (q === "PSL_OUTSIDE_APP_ACCOUNT_TYPE_SPECIFY") return (acc.outsideAppTypes ?? []).includes("PSL_OUTSIDE_APP_ACCOUNT_TYPE_OTHER") ? acc.outsideAppOther ?? "" : "";
    const m = q.match(/^PSL_DATA_USAGE_RESPONSES:([A-Z_]+):([A-Z_]+)$/);
    const d = m ? types[m[1]] : undefined;
    if (!m || !d) return "";
    switch (m[2]) {
      case "PSL_DATA_USAGE_COLLECTION_AND_SHARING":
        if (r === "PSL_DATA_USAGE_ONLY_COLLECTED") return d.collected ? "true" : "";
        if (r === "PSL_DATA_USAGE_ONLY_SHARED") return d.shared ? "true" : "";
        return "";
      case "PSL_DATA_USAGE_EPHEMERAL":
        return d.collected ? String(!!d.ephemeral) : "";
      case "DATA_USAGE_USER_CONTROL":
        if (!d.collected) return "";
        return r === (d.optional ? "PSL_DATA_USAGE_USER_CONTROL_OPTIONAL" : "PSL_DATA_USAGE_USER_CONTROL_REQUIRED") ? "true" : "";
      case "DATA_USAGE_COLLECTION_PURPOSE":
        return d.collected && (d.purposes ?? []).includes(r) ? "true" : "";
      case "DATA_USAGE_SHARING_PURPOSE":
        return d.shared && (d.sharingPurposes ?? []).includes(r) ? "true" : "";
      default:
        return "";
    }
  };
  const out = [rows[0].map(esc).join(",")];
  for (const r of rows.slice(1)) {
    if (!r[0]) continue;
    r[2] = value(r[0], r[1] ?? "");
    out.push(r.map(esc).join(","));
  }
  return out.join("\n") + "\n";
}
