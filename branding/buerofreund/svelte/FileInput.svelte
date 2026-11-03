<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileInputNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileInputNode} iconName="FileInput" />
