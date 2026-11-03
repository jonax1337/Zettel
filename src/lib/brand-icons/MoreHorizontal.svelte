<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { MoreHorizontalNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={MoreHorizontalNode} iconName="MoreHorizontal" />
