import type { GooglePlayClient } from "./client.js";

export async function getAppDetails(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
) {
  const res = await client.api.edits.details.get({ packageName, editId });
  return res.data;
}

export async function updateAppDetails(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
  details: {
    contactEmail?: string;
    contactPhone?: string;
    contactWebsite?: string;
    defaultLanguage?: string;
  },
) {
  // patch: solo los campos enviados. update reemplazaba todo y dejaba vacío defaultLanguage
  // ("The default language for your application is not currently supported" al validar).
  const res = await client.api.edits.details.patch({
    packageName,
    editId,
    requestBody: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)),
  });
  return res.data;
}

export async function listBundles(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
) {
  const res = await client.api.edits.bundles.list({ packageName, editId });
  return res.data.bundles || [];
}

export async function listApks(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
) {
  const res = await client.api.edits.apks.list({ packageName, editId });
  return res.data.apks || [];
}
