<script lang="ts">
  import { Input } from "$lib/ui";
  import { Search } from "$lib/brand-icons";
  import { cn } from "$lib/utils";

  type Props = {
    value?: string;
    placeholder: string;
    class?: string;
  };
  let { value = $bindable(""), placeholder, class: klass }: Props = $props();
</script>

<div class={cn("relative", klass)}>
  <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
  <Input type="search" {placeholder} bind:value class="pl-9" />
</div>
