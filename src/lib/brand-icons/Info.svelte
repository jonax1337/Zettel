<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { InfoNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={InfoNode} iconName="Info" />
