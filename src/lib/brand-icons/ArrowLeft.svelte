<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ArrowLeftNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ArrowLeftNode} iconName="ArrowLeft" />
