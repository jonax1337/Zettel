<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import BackupSection from "./BackupSection.svelte";
  import AutoBackupSection from "./AutoBackupSection.svelte";
  import IntegritySection from "./IntegritySection.svelte";
  import SandboxSection from "./SandboxSection.svelte";
  import CliSection from "./CliSection.svelte";
</script>

<SettingsShell
  page="/settings/data"
  description="Deine Daten liegen nur auf diesem Rechner. Sichere sie regelmäßig."
>
  <BackupSection />
  <AutoBackupSection />
  <IntegritySection />
  <SandboxSection />
  <CliSection />
</SettingsShell>
