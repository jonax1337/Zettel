<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { PackageNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={PackageNode} iconName="Package" />
