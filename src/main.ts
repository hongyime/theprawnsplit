import App from "./App.svelte";
import "./styles.css";

const target = document.getElementById("app");
if (!target) throw new Error("Missing #app target");

export default new App({ target });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is best-effort; the app remains fully local without sync.
    });
  });
}
