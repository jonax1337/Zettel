<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import StubNotice from "./StubNotice.svelte";
</script>

<SettingsShell
  title="Dokumente"
  description="Rechnungen, Angebote, Nummernkreise und ZUGFeRD-Profil."
>
  <StubNotice issue={74} />
</SettingsShell>
