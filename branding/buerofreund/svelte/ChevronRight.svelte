<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ChevronRightNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ChevronRightNode} iconName="ChevronRight" />
