<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ClockNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ClockNode} iconName="Clock" />
