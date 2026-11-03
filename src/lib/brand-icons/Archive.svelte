<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { ArchiveNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={ArchiveNode} iconName="Archive" />
