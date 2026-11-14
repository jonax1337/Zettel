import { execute, insert, select, toSqlBool } from "./client";
import { MISSING_NAME } from "./doc-queries";
import type { Project } from "./schema";

export type ProjectRow = {
  id: number;
  customer_id: number;
  name: string;
  hourly_rate_cent: number;
  archived: number;
  created_at: number;
  updated_at: number;
};

export function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    customerId: r.customer_id,
    name: r.name,
    hourlyRateCent: r.hourly_rate_cent,
    archived: r.archived === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type ProjectInput = {
  customerId: number;
  name: string;
  hourlyRateCent: number;
};

/** A project with the data the lists and selects show next to it. */
export type ProjectListRow = Project & { customerName: string; entryCount: number };

export type ProjectFilter = {
  customerId?: number | "all";
  includeArchived?: boolean;
};

function validated(input: ProjectInput): ProjectInput {
  const name = input.name.trim();
  if (name === "") throw new Error("Bitte einen Projektnamen angeben.");
  if (!Number.isInteger(input.hourlyRateCent) || input.hourlyRateCent < 0) {
    throw new Error("Der Stundensatz darf nicht negativ sein.");
  }
  return { ...input, name };
}

export async function listProjects(filter: ProjectFilter = {}): Promise<ProjectListRow[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (!filter.includeArchived) conditions.push("p.archived = 0");
  if (filter.customerId && filter.customerId !== "all") {
    conditions.push("p.customer_id = ?");
    binds.push(filter.customerId);
  }
  const rows = await select<ProjectRow & { customer_name: string | null; entry_count: number }>(
    `SELECT p.*, c.name AS customer_name,
            (SELECT COUNT(*) FROM time_entries t WHERE t.project_id = p.id) AS entry_count
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC, p.id ASC`,
    binds,
  );
  return rows.map((r) => ({
    ...mapProject(r),
    customerName: r.customer_name ?? MISSING_NAME,
    entryCount: r.entry_count,
  }));
}

export async function getProject(id: number): Promise<Project | null> {
  const [row] = await select<ProjectRow>("SELECT * FROM projects WHERE id = ?", [id]);
  return row ? mapProject(row) : null;
}

export async function createProject(input: ProjectInput): Promise<number> {
  const { customerId, name, hourlyRateCent } = validated(input);
  return insert("INSERT INTO projects (customer_id, name, hourly_rate_cent) VALUES (?, ?, ?)", [
    customerId,
    name,
    hourlyRateCent,
  ]);
}

async function countEntries(projectId: number): Promise<number> {
  const [row] = await select<{ n: number }>("SELECT COUNT(*) AS n FROM time_entries WHERE project_id = ?", [
    projectId,
  ]);
  return row?.n ?? 0;
}

/**
 * Entries carry the project's customer into billing, so a project with entries
 * keeps its customer. The hourly rate applies to entries not yet billed; billed
 * ones keep the rate printed on their invoice.
 */
export async function updateProject(id: number, input: ProjectInput): Promise<void> {
  const { customerId, name, hourlyRateCent } = validated(input);
  const current = await getProject(id);
  if (!current) throw new Error("Das Projekt wurde nicht gefunden.");
  if (current.customerId !== customerId && (await countEntries(id)) > 0) {
    throw new Error("Der Kunde eines Projekts mit Zeiteinträgen kann nicht geändert werden.");
  }
  await execute(
    "UPDATE projects SET customer_id = ?, name = ?, hourly_rate_cent = ?, updated_at = unixepoch() WHERE id = ?",
    [customerId, name, hourlyRateCent, id],
  );
}

export async function setProjectArchived(id: number, archived: boolean): Promise<void> {
  await execute("UPDATE projects SET archived = ?, updated_at = unixepoch() WHERE id = ?", [
    toSqlBool(archived),
    id,
  ]);
}

export async function deleteProject(id: number): Promise<void> {
  if ((await countEntries(id)) > 0) {
    throw new Error("Das Projekt hat Zeiteinträge und kann nur archiviert werden.");
  }
  await execute("DELETE FROM projects WHERE id = ?", [id]);
}
