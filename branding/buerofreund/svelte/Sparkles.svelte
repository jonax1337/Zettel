<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { SparklesNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={SparklesNode} iconName="Sparkles" />
