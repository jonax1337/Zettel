<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { CheckCircle2Node } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={CheckCircle2Node} iconName="CheckCircle2" />
