import {
  changedNumberCounters,
  loadSettings,
  saveNumberCounters,
  saveSettings,
  type NumberCounters,
} from "$lib/db/queries";
import type { Settings } from "$lib/db/schema";
import { toast } from "$lib/ui/toast.svelte";
import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";

/** Load/edit/save lifecycle shared by the settings pages that edit the settings row as one form. */
export class SettingsForm {
  settings = $state<Settings | null>(null);
  loading = $state(true);
  saving = $state(false);
  error = $state<string | null>(null);
  // Counters as loaded: only the ones edited here are written back, so a
  // number drawn meanwhile is not overwritten.
  #loadedCounters: NumberCounters | null = null;
  private readonly unsaved = guardUnsavedChanges(
    () => this.settings,
    () => !this.loading,
  );

  async load() {
    try {
      this.settings = await loadSettings();
      this.#loadedCounters = { ...this.settings };
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }

  async submit(event: SubmitEvent) {
    event.preventDefault();
    if (!this.settings || !this.#loadedCounters) return;
    this.saving = true;
    this.error = null;
    try {
      await saveSettings(this.settings);
      await saveNumberCounters(changedNumberCounters(this.#loadedCounters, this.settings));
      this.#loadedCounters = { ...this.settings };
      this.unsaved.markClean();
      toast.success("Einstellungen gespeichert");
    } catch (e) {
      this.error = String(e);
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      this.saving = false;
    }
  }
}
