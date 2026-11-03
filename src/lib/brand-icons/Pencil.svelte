<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { PencilNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={PencilNode} iconName="Pencil" />
