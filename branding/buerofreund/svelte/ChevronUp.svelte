<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ChevronUpNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ChevronUpNode} iconName="ChevronUp" />
