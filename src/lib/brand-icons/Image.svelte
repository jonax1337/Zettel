<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ImageNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ImageNode} iconName="Image" />
