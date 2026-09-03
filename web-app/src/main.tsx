import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const BASE = import.meta.env.BASE_URL ?? "/";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registrarServiceWorker();

/**
 * Registro del service worker con recarga automática al activarse uno nuevo.
 *
 * Sin esto, en una PWA instalada el SW viejo sigue controlando la pestaña y el usuario ve la
 * versión anterior por días, aunque el deploy esté verde. Y en una PWA instalada no puede
 * hacer Ctrl+Shift+R.
 */
function registrarServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  let recargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${BASE}sw.js`)
      .then((reg) => {
        if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        reg.addEventListener("updatefound", () => {
          const nuevo = reg.installing;
          if (!nuevo) return;
          nuevo.addEventListener("statechange", () => {
            if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
              nuevo.postMessage("SKIP_WAITING");
            }
          });
        });
        // Los navegadores chequean actualizaciones cada 24 h por defecto: se fuerza.
        void reg.update().catch(() => {});
      })
      .catch(() => {});
  });
}
