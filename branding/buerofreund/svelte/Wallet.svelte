<script lang="ts">
  import BrandIcon from "./BrandIcon.svelte";
  import { WalletNode } from "./nodes";
  import type { IconProps } from "./types";

  let props: IconProps = $props();
</script>

<BrandIcon {...props} nodes={WalletNode} iconName="Wallet" />
