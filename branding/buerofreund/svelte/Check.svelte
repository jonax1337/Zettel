<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { CheckNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={CheckNode} iconName="Check" />
