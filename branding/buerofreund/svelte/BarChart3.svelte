<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { BarChart3Node } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={BarChart3Node} iconName="BarChart3" />
