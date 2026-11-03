<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FilePlus2Node } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FilePlus2Node} iconName="FilePlus2" />
