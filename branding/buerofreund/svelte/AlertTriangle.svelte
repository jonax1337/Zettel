<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { AlertTriangleNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={AlertTriangleNode} iconName="AlertTriangle" />
