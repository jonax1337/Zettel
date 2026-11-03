<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileWarningNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileWarningNode} iconName="FileWarning" />
