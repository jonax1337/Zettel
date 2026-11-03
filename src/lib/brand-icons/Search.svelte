<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { SearchNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={SearchNode} iconName="Search" />
