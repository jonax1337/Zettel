<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { DatabaseNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={DatabaseNode} iconName="Database" />
