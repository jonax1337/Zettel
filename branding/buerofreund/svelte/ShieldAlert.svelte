<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ShieldAlertNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ShieldAlertNode} iconName="ShieldAlert" />
