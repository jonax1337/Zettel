<script lang="ts">
  import { Input, Label, Card, CardHeader, CardTitle, CardContent } from "$lib/ui";

  type Props = {
    title: string;
    format: string;
    counter: number;
    defaultDays: number;
    defaultDaysLabel: string;
    defaultDaysMin: number;
  };
  let {
    title,
    format = $bindable(),
    counter = $bindable(),
    defaultDays = $bindable(),
    defaultDaysLabel,
    defaultDaysMin,
  }: Props = $props();
</script>

<Card>
  <CardHeader>
    <CardTitle>{title}</CardTitle>
  </CardHeader>
  <CardContent>
    <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-col gap-1.5">
        <Label>Nummern-Format</Label>
        <Input bind:value={format} />
        <span class="text-xs text-muted-foreground">
          Platzhalter: {"{YYYY}"}, {"{NNNN}"}
        </span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>Aktueller Zähler</Label>
        <Input type="number" min="0" bind:value={counter} />
      </div>
      <div class="flex flex-col gap-1.5 col-span-2">
        <Label>{defaultDaysLabel}</Label>
        <Input type="number" min={defaultDaysMin} bind:value={defaultDays} />
      </div>
    </div>
  </CardContent>
</Card>
