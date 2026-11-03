<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { SettingsNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={SettingsNode} iconName="Settings" />
