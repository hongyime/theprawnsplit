import { mount } from "svelte";
import App from "./App.svelte";
import "./styles.css";

const target = document.getElementById("app");

try {
  if (!target) throw new Error("#app mount point missing from index.html");
  mount(App, { target });
} catch (err) {
  console.error("[the-prawn-split] mount failed:", err);
  if (target) {
    target.innerHTML = `
      <div style="font-family:system-ui,sans-serif;padding:2rem;max-width:34rem;margin:0 auto">
        <h1 style="font-size:1.1rem;margin:0 0 .5rem">The Prawn Split failed to start</h1>
        <p style="color:#555;margin:0 0 1rem">
          Something went wrong loading the app. Reloading may help.
        </p>
        <pre style="background:#f4f4f5;padding:.75rem;border-radius:.5rem;overflow:auto;font-size:.8rem">${
          err instanceof Error ? err.message : String(err)
        }</pre>
      </div>`;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is best-effort; the app remains fully local without sync.
    });
  });
}
