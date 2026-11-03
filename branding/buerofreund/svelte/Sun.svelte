<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { SunNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={SunNode} iconName="Sun" />
