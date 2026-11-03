<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { SquareNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={SquareNode} iconName="Square" />
