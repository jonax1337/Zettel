<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileUpNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileUpNode} iconName="FileUp" />
