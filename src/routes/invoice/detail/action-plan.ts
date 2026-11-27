/** Where a document action shows up on the detail page. At most one action of a plan is "main". */
export type ActionPlacement = "main" | "header" | "menu";

export type PlannedAction<Id extends string> = { id: Id; placement: ActionPlacement };

/** Orders a plan for display: header buttons first, then the main action, then the menu entries. */
export function arrangePlan<Id extends string>(
  headerIds: Id[],
  mainId: Id | null,
  menuIds: Id[],
): PlannedAction<Id>[] {
  return [
    ...headerIds.map((id) => ({ id, placement: "header" as const })),
    ...(mainId ? [{ id: mainId, placement: "main" as const }] : []),
    ...menuIds.map((id) => ({ id, placement: "menu" as const })),
  ];
}

export function actionsAt<Id extends string>(plan: PlannedAction<Id>[], placement: ActionPlacement): Id[] {
  return plan.filter((action) => action.placement === placement).map((action) => action.id);
}

/** The buttons of the header, in display order: secondary ones first, the main action last. */
export function buttonActions<Id extends string>(plan: PlannedAction<Id>[]): Id[] {
  return plan.filter((action) => action.placement !== "menu").map((action) => action.id);
}
