<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { Trash2Node } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={Trash2Node} iconName="Trash2" />
