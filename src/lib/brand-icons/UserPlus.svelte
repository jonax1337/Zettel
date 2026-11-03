<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { UserPlusNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={UserPlusNode} iconName="UserPlus" />
