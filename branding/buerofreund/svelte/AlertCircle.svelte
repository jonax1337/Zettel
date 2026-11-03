<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { AlertCircleNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={AlertCircleNode} iconName="AlertCircle" />
