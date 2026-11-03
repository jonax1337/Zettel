<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ShieldCheckNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ShieldCheckNode} iconName="ShieldCheck" />
