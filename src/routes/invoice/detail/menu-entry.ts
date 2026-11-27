import type { Component } from "svelte";

export type MenuEntry = {
  id: string;
  label: string;
  icon: Component;
  /** Entries of different groups are divided by a separator. */
  group: number;
  destructive?: boolean;
  disabled?: boolean;
  /** Why the entry is unavailable, or what it did last; shown under the label. */
  hint?: string;
  onSelect: () => void;
};
