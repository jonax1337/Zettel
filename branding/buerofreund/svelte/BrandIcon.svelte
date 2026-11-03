<script lang="ts">
  import type { IconNode, IconProps } from "./types";

  let {
    nodes,
    iconName,
    size = 24,
    color = "currentColor",
    strokeWidth = 2,
    absoluteStrokeWidth = false,
    class: className,
    title,
    children,
    ...rest
  }: IconProps & { nodes: IconNode; iconName: string } = $props();

  const labelled = $derived(
    Boolean(title || rest["aria-label"] || rest["aria-labelledby"]),
  );
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  color={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={["zettel-icon", className]}
  data-icon={iconName}
  aria-hidden={labelled ? undefined : true}
  role={labelled ? "img" : undefined}
  {...rest}
>
  {#if title}
    <title>{title}</title>
  {/if}
  {#each nodes as [tag, attributes]}
    <svelte:element
      this={tag}
      {...attributes}
      vector-effect={absoluteStrokeWidth ? "non-scaling-stroke" : undefined}
    />
  {/each}
  {#if children}
    {@render children()}
  {/if}
</svg>
