<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { TrendingDownNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={TrendingDownNode} iconName="TrendingDown" />
