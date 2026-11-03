<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { MonitorNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={MonitorNode} iconName="Monitor" />
