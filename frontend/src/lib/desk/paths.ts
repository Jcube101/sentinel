// Page addresses for items and editions.

/** "/item/fire/madhya-pradesh", with "?edition=19" when not the latest edition. */
export function itemPath(id: string, edition: number | null = null): string {
  const i = id.indexOf(':')
  const path = `/item/${id.slice(0, i)}/${encodeURIComponent(id.slice(i + 1))}`
  return edition !== null ? `${path}?edition=${edition}` : path
}

/** "?edition=19" for a past edition, "" for the latest. */
export function editionQuery(edition: number | null, latest: number | null): string {
  return edition !== null && edition !== latest ? `?edition=${edition}` : ''
}
