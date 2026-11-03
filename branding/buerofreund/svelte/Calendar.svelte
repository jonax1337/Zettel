<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { CalendarNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={CalendarNode} iconName="Calendar" />
