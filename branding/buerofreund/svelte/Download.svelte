<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { DownloadNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={DownloadNode} iconName="Download" />
