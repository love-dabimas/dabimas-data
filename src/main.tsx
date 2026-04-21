import React from "react";
import ReactDOM from "react-dom/client";
import "@/styles/legacy.css";
import "@/styles/fontawesome.css";
import "@/styles/app.css";
import { App } from "@/app/App";

// 本番配信時のみ service worker を登録し、JSON と静的アセットの再利用を有効にする。
const registerServiceWorker = () => {
  // 開発時や非対応ブラウザでは通常表示だけで十分なので何もしない。
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    // BASE_URL を使うことで GitHub Pages 配下でも正しいスコープに登録できる。
    const baseUrl = import.meta.env.BASE_URL;
    void navigator.serviceWorker
      .register(`${baseUrl}service-worker.js`, { scope: baseUrl })
      .catch((error: unknown) => {
        console.error("Service worker registration failed.", error);
      });
  });
};

registerServiceWorker();

// React.StrictMode は開発中に副作用の書き方を検査しやすくするために残している。
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
