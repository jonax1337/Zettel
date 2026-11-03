<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { LandmarkNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={LandmarkNode} iconName="Landmark" />
