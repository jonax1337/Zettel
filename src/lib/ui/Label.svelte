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
  $effect(() => {
    if (!labelEl || htmlFor || labelEl.querySelector("input, select, textarea")) return;
    const control = findLabelTarget(labelEl);
    if (!control) return;
    if (needsAriaLabelledby(control)) {
      control.setAttribute("aria-labelledby", id ?? ownId);
      return;
    }
    if (!control.id) control.id = nextControlId("field");
    labelEl.htmlFor = control.id;
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
