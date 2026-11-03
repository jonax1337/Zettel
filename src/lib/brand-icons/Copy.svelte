<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { CopyNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={CopyNode} iconName="Copy" />
