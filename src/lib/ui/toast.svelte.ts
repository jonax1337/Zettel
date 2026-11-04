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

const DURATION_MS: Record<ToastVariant, number> = {
  default: 3500,
  success: 3500,
  error: 5000,
  warning: 4000,
};
const PERSISTENT = 0;

let nextId = 1;

export const toasts = $state<{ items: Toast[] }>({ items: [] });

function push(t: Omit<Toast, "id">) {
  const id = nextId++;
  toasts.items = [...toasts.items, { id, ...t }];
  if (t.duration !== PERSISTENT) {
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
      duration: PERSISTENT,
      ...opts,
      action,
    }),
};
