<script lang="ts">
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/ui";
  import { centsToEur } from "$lib/utils/money";

  type Props = {
    title: string;
    description: string;
    reserveCents: number;
    basis: string;
    selected: boolean;
    onSelect: () => void;
  };
  let { title, description, reserveCents, basis, selected, onSelect }: Props = $props();
</script>

<Card
  class={selected ? "ring-2 ring-primary cursor-pointer" : "cursor-pointer hover:bg-muted/40 transition-colors"}
  onclick={onSelect}
>
  <CardHeader>
    <CardTitle>{title}</CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
  <CardContent>
    <div class="text-4xl font-semibold tabular-nums">{centsToEur(reserveCents)}</div>
    <p class="text-xs text-muted-foreground mt-2">{basis}</p>
  </CardContent>
</Card>
