<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ChevronsUpDownNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ChevronsUpDownNode} iconName="ChevronsUpDown" />
