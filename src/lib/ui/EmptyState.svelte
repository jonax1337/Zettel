<script lang="ts">
  import Card from "./Card.svelte";
  import Button from "./Button.svelte";
  import emptyIllustration from "../../assets/brand/empty-invoices.svg";
  import noResultsIllustration from "../../assets/brand/no-results.svg";

  type Props = {
    message: string;
    /** "no-results" when a search or filter hides existing rows. */
    variant?: "empty" | "no-results";
    /** Call to action such as "Neue Rechnung"; shown only together with `onAction`. */
    actionLabel?: string;
    onAction?: () => void;
    /** "outline" where the page header already carries the one filled button. */
    actionVariant?: "default" | "outline";
  };

  let { message, variant = "empty", actionLabel, onAction, actionVariant = "default" }: Props = $props();
</script>

<Card>
  <div class="flex flex-col items-center gap-3 px-6 py-10 text-center">
    <img
      src={variant === "no-results" ? noResultsIllustration : emptyIllustration}
      alt=""
      class="h-36 w-auto"
      draggable="false"
    />
    <p class="text-sm text-muted-foreground">{message}</p>
    {#if actionLabel && onAction}
      <Button variant={actionVariant} onclick={onAction}>{actionLabel}</Button>
    {/if}
  </div>
</Card>
