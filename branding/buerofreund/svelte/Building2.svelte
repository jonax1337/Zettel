<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { Building2Node } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={Building2Node} iconName="Building2" />
