import { execute, select } from "./client";
import type { CatalogItem } from "./schema";

type CatalogRow = {
  id: number;
  name: string;
  description_de: string;
  description_en: string | null;
  unit: string;
  default_unit_price: number;
  default_vat_rate: number;
  default_datev_account: string | null;
  tags: string | null;
  archived: number;
  created_at: number;
  updated_at: number;
};

function mapCatalog(r: CatalogRow): CatalogItem {
  return {
    id: r.id,
    name: r.name,
    descriptionDe: r.description_de,
    descriptionEn: r.description_en,
    unit: r.unit,
    defaultUnitPrice: r.default_unit_price,
    defaultVatRate: r.default_vat_rate,
    defaultDatevAccount: r.default_datev_account,
    tags: r.tags,
    archived: r.archived === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type CatalogInput = Omit<
  CatalogItem,
  "id" | "createdAt" | "updatedAt"
>;

export async function listCatalog(opts: { includeArchived?: boolean } = {}): Promise<CatalogItem[]> {
  const where = opts.includeArchived ? "" : "WHERE archived = 0";
  const rows = await select<CatalogRow>(
    `SELECT * FROM catalog_items ${where} ORDER BY name COLLATE NOCASE ASC`,
  );
  return rows.map(mapCatalog);
}

export async function searchCatalog(query: string, limit = 30): Promise<CatalogItem[]> {
  const q = query.trim();
  if (q === "") return (await listCatalog()).slice(0, limit);
  const like = `%${q}%`;
  const rows = await select<CatalogRow>(
    `SELECT * FROM catalog_items
     WHERE archived = 0
       AND (name LIKE ?1 OR description_de LIKE ?1 OR description_en LIKE ?1 OR tags LIKE ?1)
     ORDER BY name COLLATE NOCASE ASC
     LIMIT ?2`,
    [like, limit],
  );
  return rows.map(mapCatalog);
}

export async function getCatalogItem(id: number): Promise<CatalogItem | null> {
  const rows = await select<CatalogRow>("SELECT * FROM catalog_items WHERE id = ?", [id]);
  return rows.length ? mapCatalog(rows[0]) : null;
}

export async function createCatalogItem(input: CatalogInput): Promise<number> {
  const res = await execute(
    `INSERT INTO catalog_items
      (name, description_de, description_en, unit, default_unit_price,
       default_vat_rate, default_datev_account, tags, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.descriptionDe ?? "",
      input.descriptionEn ?? null,
      input.unit ?? "Stk",
      input.defaultUnitPrice ?? 0,
      input.defaultVatRate ?? 19,
      input.defaultDatevAccount ?? null,
      input.tags ?? null,
      input.archived ? 1 : 0,
    ],
  );
  return Number(res.lastInsertId ?? 0);
}

export async function updateCatalogItem(id: number, input: CatalogInput): Promise<void> {
  await execute(
    `UPDATE catalog_items SET
      name = ?, description_de = ?, description_en = ?, unit = ?,
      default_unit_price = ?, default_vat_rate = ?, default_datev_account = ?,
      tags = ?, archived = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.name,
      input.descriptionDe ?? "",
      input.descriptionEn ?? null,
      input.unit ?? "Stk",
      input.defaultUnitPrice ?? 0,
      input.defaultVatRate ?? 19,
      input.defaultDatevAccount ?? null,
      input.tags ?? null,
      input.archived ? 1 : 0,
      id,
    ],
  );
}

export async function deleteCatalogItem(id: number): Promise<void> {
  await execute("DELETE FROM catalog_items WHERE id = ?", [id]);
}

export async function setArchived(id: number, archived: boolean): Promise<void> {
  await execute(
    "UPDATE catalog_items SET archived = ?, updated_at = unixepoch() WHERE id = ?",
    [archived ? 1 : 0, id],
  );
}
