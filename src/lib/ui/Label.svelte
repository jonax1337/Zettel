<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLLabelAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";
  import { findLabelTarget, needsAriaLabelledby, nextControlId } from "./label-target";

  type Props = HTMLLabelAttributes & { class?: string; children?: Snippet };
  let { class: klass, children, for: htmlFor, id, ...rest }: Props = $props();

  let labelEl = $state<HTMLLabelElement | null>(null);
  const ownId = nextControlId("label");

  // An explicit `for` or a control wrapped inside the label already associates them.
  // Controls rendered after the label (conditional or async siblings) are picked up by the observer.
  $effect(() => {
    const label = labelEl;
    if (!label || htmlFor || label.querySelector("input, select, textarea")) return;

    function associate(target: HTMLLabelElement): boolean {
      const control = findLabelTarget(target);
      if (!control) return false;
      if (needsAriaLabelledby(control)) {
        control.setAttribute("aria-labelledby", id ?? ownId);
        return true;
      }
      if (!control.id) control.id = nextControlId("field");
      target.htmlFor = control.id;
      return true;
    }

    if (associate(label) || !label.parentElement) return;
    const observer = new MutationObserver(() => {
      if (associate(label)) observer.disconnect();
    });
    observer.observe(label.parentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
</script>

<label
  bind:this={labelEl}
  id={id ?? ownId}
  for={htmlFor}
  class={cn(
    "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    klass,
  )}
  {...rest}
>
  {@render children?.()}
</label>
