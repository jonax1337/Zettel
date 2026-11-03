<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ShieldNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ShieldNode} iconName="Shield" />
