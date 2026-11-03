<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { PowerOffNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={PowerOffNode} iconName="PowerOff" />
