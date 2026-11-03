<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { PowerNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={PowerNode} iconName="Power" />
