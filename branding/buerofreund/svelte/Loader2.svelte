<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { Loader2Node } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={Loader2Node} iconName="Loader2" />
