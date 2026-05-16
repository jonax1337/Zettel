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

let nextId = 1;

export const toasts = $state<{ items: Toast[] }>({ items: [] });

function push(t: Omit<Toast, "id">) {
  const id = nextId++;
  toasts.items = [...toasts.items, { id, ...t }];
  if (t.duration > 0) {
    setTimeout(() => dismiss(id), t.duration);
  }
  return id;
}

export function dismiss(id: number) {
  toasts.items = toasts.items.filter((t) => t.id !== id);
}

export const toast = {
  show: (title: string, opts: Partial<Omit<Toast, "id" | "title">> = {}) =>
    push({ title, variant: "default", duration: 3500, ...opts }),
  success: (title: string, description?: string) =>
    push({ title, description, variant: "success", duration: 3500 }),
  error: (title: string, description?: string) =>
    push({ title, description, variant: "error", duration: 5000 }),
  warning: (title: string, description?: string) =>
    push({ title, description, variant: "warning", duration: 4000 }),
  action: (
    title: string,
    action: ToastAction,
    opts: Partial<Omit<Toast, "id" | "title" | "action">> = {},
  ) =>
    push({
      title,
      variant: "default",
      duration: 0,
      ...opts,
      action,
    }),
};
