<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileDownNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileDownNode} iconName="FileDown" />
