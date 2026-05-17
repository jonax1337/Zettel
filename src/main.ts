import { mount } from "svelte";
import App from "./App.svelte";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./app.css";
import "./lib/theme.svelte";

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
