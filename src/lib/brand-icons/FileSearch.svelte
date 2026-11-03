<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileSearchNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileSearchNode} iconName="FileSearch" />
