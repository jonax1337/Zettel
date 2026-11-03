<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ArrowRightNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ArrowRightNode} iconName="ArrowRight" />
