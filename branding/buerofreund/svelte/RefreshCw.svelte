<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { RefreshCwNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={RefreshCwNode} iconName="RefreshCw" />
