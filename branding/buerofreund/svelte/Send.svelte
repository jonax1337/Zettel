<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { SendNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={SendNode} iconName="Send" />
