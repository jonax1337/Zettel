<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { Undo2Node } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={Undo2Node} iconName="Undo2" />
