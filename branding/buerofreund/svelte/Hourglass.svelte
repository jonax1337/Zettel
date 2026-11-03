<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { HourglassNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={HourglassNode} iconName="Hourglass" />
