<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { LayoutDashboardNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={LayoutDashboardNode} iconName="LayoutDashboard" />
