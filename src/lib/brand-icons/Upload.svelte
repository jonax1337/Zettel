<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { UploadNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={UploadNode} iconName="Upload" />
