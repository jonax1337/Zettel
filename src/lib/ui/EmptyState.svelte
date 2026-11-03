<script lang="ts">
  import Card from "./Card.svelte";
  import emptyIllustration from "../../assets/brand/empty-invoices.svg";
  import noResultsIllustration from "../../assets/brand/no-results.svg";

  type Props = {
    message: string;
    /** "no-results" when a search or filter hides existing rows. */
    variant?: "empty" | "no-results";
  };

  let { message, variant = "empty" }: Props = $props();
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
  </div>
</Card>
