import { mount } from "svelte";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
// Must load before the router so its hashchange listener runs first and can hold back a blocked navigation.
import "./lib/utils/unsaved-guard.svelte";
import App from "./App.svelte";
import "./app.css";
import "./lib/theme.svelte";
import { isTauri } from "./lib/updater";

// The window starts hidden (tauri.conf.json) so the blank webview and the
// window-state resize stay invisible; reveal it once the app is mounted, and
// also if mounting throws, so the error is not hidden behind an invisible window.
// WebView2 may not have painted yet when the window appears, so its default
// white background is first replaced with the theme background.
async function revealWindow() {
  if (!isTauri()) return;
  const appWindow = getCurrentWebviewWindow();
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();
  try {
    if (background) await appWindow.setBackgroundColor(background);
  } catch (err) {
    console.error("Fensterhintergrund konnte nicht gesetzt werden:", err);
  }
  try {
    await appWindow.show();
    await appWindow.setFocus();
  } catch (err) {
    console.error("Fenster konnte nicht angezeigt werden:", err);
  }
}

let app: ReturnType<typeof mount>;
try {
  app = mount(App, {
    target: document.getElementById("app")!,
  });
} finally {
  void revealWindow();
}

export default app;
