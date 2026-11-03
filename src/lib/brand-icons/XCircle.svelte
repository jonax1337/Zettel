<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { XCircleNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={XCircleNode} iconName="XCircle" />
