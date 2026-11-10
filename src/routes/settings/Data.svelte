<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import BackupRestoreCard from "./BackupRestoreCard.svelte";
  import AutoBackupCard from "./AutoBackupCard.svelte";
  import IntegrityCard from "./IntegrityCard.svelte";
  import SandboxCard from "./SandboxCard.svelte";
  import CliCard from "./CliCard.svelte";
</script>

<SettingsShell
  title="Daten"
  description="Backup, Wiederherstellung, Integritätsprüfung, Sandbox-Modus und Kommandozeile."
>
  <div class="space-y-6">
    <BackupRestoreCard />
    <AutoBackupCard />
    <IntegrityCard />
    <SandboxCard />
    <CliCard />
  </div>
</SettingsShell>
