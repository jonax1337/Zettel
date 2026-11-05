/** Restarts the app, e.g. so a staged restore or a DB switch takes effect. */
export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
