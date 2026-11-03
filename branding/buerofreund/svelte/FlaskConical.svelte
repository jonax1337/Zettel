<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FlaskConicalNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FlaskConicalNode} iconName="FlaskConical" />
