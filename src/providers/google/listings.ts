import type { GooglePlayClient } from "./client.js";

export async function getListings(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
) {
  const res = await client.api.edits.listings.list({ packageName, editId });
  return res.data.listings || [];
}

export async function getListing(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
  language: string,
) {
  const res = await client.api.edits.listings.get({
    packageName,
    editId,
    language,
  });
  return res.data;
}

export async function updateListing(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
  language: string,
  listing: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
    video?: string;
  },
) {
  // patch: solo cambia los campos enviados (update/PUT borraba título y descripción corta si no venían).
  try {
    const res = await client.api.edits.listings.patch({ packageName, editId, language, requestBody: listing });
    return res.data;
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
    const res = await client.api.edits.listings.update({ packageName, editId, language, requestBody: listing });
    return res.data;
  }
}

export async function createListing(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
  language: string,
  listing: {
    title: string;
    shortDescription: string;
    fullDescription: string;
    video?: string;
  },
) {
  const res = await client.api.edits.listings.update({
    packageName,
    editId,
    language,
    requestBody: listing,
  });
  return res.data;
}
