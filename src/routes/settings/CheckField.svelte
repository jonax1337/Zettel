<script lang="ts">
  import { Checkbox } from "$lib/ui";
  import { cn } from "$lib/utils";

  type Props = {
    checked: boolean;
    label: string;
    hint?: string;
    wide?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  };
  let {
    checked = $bindable(),
    label,
    hint,
    wide = false,
    disabled = false,
    onCheckedChange,
  }: Props = $props();
</script>

<label class={cn("flex cursor-pointer items-start gap-2.5 text-sm select-none", wide && "col-span-2")}>
  <Checkbox bind:checked {disabled} {onCheckedChange} class="mt-0.5" />
  <span>
    <span class="font-semibold">{label}</span>
    {#if hint}<span class="mt-0.5 block text-[12.5px] text-muted-foreground">{hint}</span>{/if}
  </span>
</label>
