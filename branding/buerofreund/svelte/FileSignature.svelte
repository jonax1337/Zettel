<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileSignatureNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileSignatureNode} iconName="FileSignature" />
