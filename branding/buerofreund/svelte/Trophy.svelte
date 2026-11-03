<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { TrophyNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={TrophyNode} iconName="Trophy" />
