<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { TrendingUpNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={TrendingUpNode} iconName="TrendingUp" />
