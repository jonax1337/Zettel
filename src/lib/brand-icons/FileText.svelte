<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileTextNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileTextNode} iconName="FileText" />
