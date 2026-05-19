<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import StubNotice from "./StubNotice.svelte";
</script>

<SettingsShell
  title="Erweitert"
  description="Gefahrenzone — irreversible Aktionen auf den Geschäftsdaten."
>
  <StubNotice issue={77} danger />
</SettingsShell>
