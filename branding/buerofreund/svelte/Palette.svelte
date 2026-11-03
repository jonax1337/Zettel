<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { PaletteNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={PaletteNode} iconName="Palette" />
