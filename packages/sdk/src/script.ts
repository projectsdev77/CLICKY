import { Clicky } from "./index";

declare global {
  interface Window {
    Clicky?: typeof Clicky;
  }
}

// <script src="https://app.clicky.ai/sdk/v1/clicky.js" data-key="pk_..." async></script>
const script = document.currentScript as HTMLScriptElement | null;
window.Clicky = Clicky;

const projectKey = script?.dataset.key;
if (projectKey && script?.src) {
  Clicky.init({ projectKey, apiUrl: script.dataset.api ?? new URL(script.src).origin });
} else {
  console.warn("[clicky] add data-key=\"pk_...\" to the Clicky script tag");
}
