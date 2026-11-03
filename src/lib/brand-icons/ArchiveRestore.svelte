<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ArchiveRestoreNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ArchiveRestoreNode} iconName="ArchiveRestore" />
