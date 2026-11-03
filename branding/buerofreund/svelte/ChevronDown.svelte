<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ChevronDownNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ChevronDownNode} iconName="ChevronDown" />
