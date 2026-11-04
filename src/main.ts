import { mount } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.svelte";
import "./app.css";
import "./lib/theme.svelte";
import { isTauri } from "./lib/updater";

// The window starts hidden (tauri.conf.json) so the blank webview and the
// window-state resize stay invisible; reveal it once the app is mounted, and
// also if mounting throws, so the error is not hidden behind an invisible window.
function revealWindow() {
  if (!isTauri()) return;
  const appWindow = getCurrentWindow();
  appWindow
    .show()
    .then(() => appWindow.setFocus())
    .catch((err) => console.error("Fenster konnte nicht angezeigt werden:", err));
}

let app: ReturnType<typeof mount>;
try {
  app = mount(App, {
    target: document.getElementById("app")!,
  });
} finally {
  revealWindow();
}

export default app;
