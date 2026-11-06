<script lang="ts">
  import { Button } from "$lib/ui";
  import { Send } from "$lib/brand-icons";

  type Props = {
    /** Address of the customer; without one the button is disabled. */
    email: string | null;
    /** Another action on the page is running. */
    busy: boolean;
    /** The mail program is open and the hand-off has not finished yet. */
    sending: boolean;
    onSend: () => void;
  };
  let { email, busy, sending, onSend }: Props = $props();
</script>

<!-- A disabled button swallows pointer events, so the tooltip sits on the wrapper. -->
<span class="inline-flex" title={email ? undefined : "Beim Kunden ist keine E-Mail-Adresse hinterlegt."}>
  <Button variant="outline" disabled={!email || busy || sending} onclick={onSend}>
    <Send />
    {sending ? "Mail-Programm geöffnet…" : "Per E-Mail senden"}
  </Button>
</span>
