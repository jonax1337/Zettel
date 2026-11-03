<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FolderOpenNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FolderOpenNode} iconName="FolderOpen" />
