<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { MoonNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={MoonNode} iconName="Moon" />
