<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ScaleNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ScaleNode} iconName="Scale" />
