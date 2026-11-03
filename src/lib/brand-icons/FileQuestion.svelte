<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileQuestionNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileQuestionNode} iconName="FileQuestion" />
