<script lang="ts">
  import { Button, SaveBar } from "$lib/ui";

  type Props = {
    formId: string;
    saving: boolean;
    dirty: boolean;
    error: string | null;
    /** What saving means on this page. */
    hint: string;
  };
  let { formId, saving, dirty, error, hint }: Props = $props();
</script>

<SaveBar>
  <!-- On wide windows the content starts where the form column does: sub-navigation (13rem) plus column gap (2.5rem), see SettingsShell. -->
  <div class="flex min-w-0 items-center gap-2.5 @3xl:pl-[15.5rem]">
    <!-- Outside the form element, so it carries the form attribute. -->
    <Button type="submit" form={formId} disabled={saving}>
      {saving ? "Speichere…" : "Speichern"}
    </Button>
    {#if error}
      <span class="text-sm text-destructive">{error}</span>
    {:else}
      <span class="text-[13px] text-muted-foreground">{dirty ? "Ungespeicherte Änderungen." : hint}</span>
    {/if}
  </div>
</SaveBar>
