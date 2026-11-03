<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { XNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={XNode} iconName="X" />
