<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { FileSpreadsheetNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={FileSpreadsheetNode} iconName="FileSpreadsheet" />
