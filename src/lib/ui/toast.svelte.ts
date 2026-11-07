export type ToastVariant = "default" | "success" | "error" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

export type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  action?: ToastAction;
};

export const PERSISTENT_TOAST = 0;
// Errors stay until dismissed: a failure the user could not read in time is lost information.
const DURATION_MS: Record<ToastVariant, number> = {
  default: 3500,
  success: 3500,
  error: PERSISTENT_TOAST,
  warning: 4000,
};
// Long enough to reach the button; follow-ups like "PDF öffnen" must not pile up for good.
const ACTION_DURATION_MS = 10_000;

let nextId = 1;

export const toasts = $state<{ items: Toast[] }>({ items: [] });

function push(t: Omit<Toast, "id">) {
  const id = nextId++;
  toasts.items = [...toasts.items, { id, ...t }];
  if (t.duration !== PERSISTENT_TOAST) {
    setTimeout(() => dismiss(id), t.duration);
  }
  return id;
}

export function dismiss(id: number) {
  toasts.items = toasts.items.filter((t) => t.id !== id);
}

export const toast = {
  show: (title: string, opts: Partial<Omit<Toast, "id" | "title">> = {}) =>
    push({ title, variant: "default", duration: DURATION_MS.default, ...opts }),
  success: (title: string, description?: string) =>
    push({ title, description, variant: "success", duration: DURATION_MS.success }),
  error: (title: string, description?: string) =>
    push({ title, description, variant: "error", duration: DURATION_MS.error }),
  warning: (title: string, description?: string) =>
    push({ title, description, variant: "warning", duration: DURATION_MS.warning }),
  action: (
    title: string,
    action: ToastAction,
    opts: Partial<Omit<Toast, "id" | "title" | "action">> = {},
  ) =>
    push({
      title,
      variant: "default",
      duration: ACTION_DURATION_MS,
      ...opts,
      action,
    }),
};
