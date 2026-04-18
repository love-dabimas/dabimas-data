import React from "react";
import ReactDOM from "react-dom/client";
import "@/styles/legacy.css";
import "@/styles/fontawesome.css";
import "@/styles/app.css";
import { App } from "@/app/App";

const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    const baseUrl = import.meta.env.BASE_URL;
    void navigator.serviceWorker
      .register(`${baseUrl}service-worker.js`, { scope: baseUrl })
      .catch((error: unknown) => {
        console.error("Service worker registration failed.", error);
      });
  });
};

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
