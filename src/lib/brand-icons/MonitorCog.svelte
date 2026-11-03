<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { MonitorCogNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={MonitorCogNode} iconName="MonitorCog" />
