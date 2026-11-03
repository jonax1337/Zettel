<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ChevronLeftNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ChevronLeftNode} iconName="ChevronLeft" />
