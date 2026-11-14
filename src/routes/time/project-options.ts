import { ALL } from "../invoice/list-support";

type ProjectOption = { id: number; customerId: number; customerName: string; name: string; archived: boolean };

export const projectLabel = (project: Pick<ProjectOption, "customerName" | "name">) =>
  `${project.customerName} · ${project.name}`;

/**
 * Projects a new or edited entry may be booked on. `keepId` is the project the
 * entry already has, which stays selectable even when it has been archived.
 */
export function selectableProjects<P extends ProjectOption>(projects: P[], keepId?: number): P[] {
  return projects.filter((project) => !project.archived || project.id === keepId);
}

export function projectSelectItems(projects: ProjectOption[]): { value: string; label: string }[] {
  return projects.map((project) => ({ value: String(project.id), label: projectLabel(project) }));
}

/**
 * The project filter. Archived projects stay in because their entries are
 * listed; once a customer is chosen the customer prefix is redundant.
 */
export function projectFilterItems(projects: ProjectOption[], customerId: string): { value: string; label: string }[] {
  const allCustomers = customerId === ALL;
  const shown = allCustomers ? projects : projects.filter((project) => String(project.customerId) === customerId);
  return [
    { value: ALL, label: "Alle Projekte" },
    ...shown.map((project) => ({
      value: String(project.id),
      label: allCustomers ? projectLabel(project) : project.name,
    })),
  ];
}

/** Customers that have at least one project, once each. */
export function customerFilterOptions(projects: ProjectOption[]): { id: number; name: string }[] {
  const byId = new Map(projects.map((project) => [project.customerId, project.customerName]));
  return [...byId].map(([id, name]) => ({ id, name }));
}
