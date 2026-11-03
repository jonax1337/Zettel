<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { GripVerticalNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={GripVerticalNode} iconName="GripVertical" />
