<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { MinusNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={MinusNode} iconName="Minus" />
