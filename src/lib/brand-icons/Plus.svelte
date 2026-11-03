<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { PlusNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={PlusNode} iconName="Plus" />
