<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { CalendarRangeNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={CalendarRangeNode} iconName="CalendarRange" />
