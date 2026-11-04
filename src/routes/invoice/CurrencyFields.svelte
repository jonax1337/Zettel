<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { Button, Input, Label, Select, toast } from "$lib/ui";
  import { SUPPORTED_CURRENCIES, computeEurTotalCent, parseExchangeRateScaled } from "$lib/utils/currency";
  import { centsToEur } from "$lib/utils/money";

  type Props = {
    currency: string;
    exchangeRate: string;
    /** Document total in the selected currency, for the EUR equivalent hint. */
    totalCent: number;
    disabled?: boolean;
  };
  let {
    currency = $bindable(),
    exchangeRate = $bindable(),
    totalCent,
    disabled = false,
  }: Props = $props();

  const currencyItems = SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.label }));

  let fetchingRate = $state(false);

  const isForeignCurrency = $derived(currency !== "EUR");
  const rateScaled = $derived(isForeignCurrency ? parseExchangeRateScaled(exchangeRate) : null);
  const eurEquivalentCent = $derived(computeEurTotalCent(currency, totalCent, exchangeRate));

  async function fetchEcbRate() {
    fetchingRate = true;
    try {
      const rate = await invoke<string>("fetch_ecb_exchange_rate", { currency });
      exchangeRate = rate.replace(".", ",");
      toast.success("EZB-Tageskurs übernommen", `1 EUR = ${exchangeRate} ${currency}`);
    } catch (e) {
      toast.error("Kurs konnte nicht geholt werden", String(e));
    } finally {
      fetchingRate = false;
    }
  }
</script>

<div class="flex flex-col gap-1.5">
  <Label>Währung</Label>
  <Select bind:value={currency} items={currencyItems} {disabled} />
</div>
{#if isForeignCurrency}
  <div class="flex flex-col gap-1.5">
    <Label>Wechselkurs</Label>
    <div class="flex gap-2">
      <Input
        type="text"
        bind:value={exchangeRate}
        placeholder="z. B. 1,0832"
        inputmode="decimal"
        {disabled}
        class="flex-1"
      />
      <Button type="button" variant="outline" disabled={disabled || fetchingRate} onclick={fetchEcbRate}>
        {fetchingRate ? "Lädt…" : "EZB-Kurs"}
      </Button>
    </div>
    <p class="text-xs text-muted-foreground">
      1 EUR = X {currency}. Acht Nachkommastellen werden berücksichtigt.
    </p>
    {#if exchangeRate && !rateScaled}
      <p class="text-xs text-destructive">Ungültiger Wechselkurs.</p>
    {:else if rateScaled && eurEquivalentCent !== null}
      <p class="text-xs text-muted-foreground">
        Gesamtbetrag in EUR: <span class="font-mono">{centsToEur(eurEquivalentCent)}</span>
      </p>
    {/if}
  </div>
{/if}
