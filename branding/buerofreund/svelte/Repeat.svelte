<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { RepeatNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={RepeatNode} iconName="Repeat" />
