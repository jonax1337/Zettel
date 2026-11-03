<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { BanNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={BanNode} iconName="Ban" />
