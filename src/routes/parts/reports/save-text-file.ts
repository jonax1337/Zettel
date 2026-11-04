import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

/** Asks where to save, then writes the text there. Resolves to false when the user cancelled. */
export async function saveTextFileWithDialog(options: {
  defaultPath: string;
  filterName: string;
  extension: string;
  content: string;
}): Promise<boolean> {
  const targetPath = await save({
    defaultPath: options.defaultPath,
    filters: [{ name: options.filterName, extensions: [options.extension] }],
  });
  if (!targetPath) return false;
  await invoke<string>("save_text_file", { path: targetPath, content: options.content });
  return true;
}
