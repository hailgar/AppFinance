import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Today from "../../app/(tabs)/index";
import History from "../../app/(tabs)/history";
import Summary from "../../app/(tabs)/summary";
import Settings from "../../app/(tabs)/settings";
import NewTransaction from "../../app/transaction";
import TransactionDetail from "../../app/transaction-detail";
import Budget from "../../app/budget";
import { router, usePreviewRoute } from "./router";
import { resetExamples } from "./fixtures.mjs";
import "./style.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});
const routes = {
  "/": Today,
  "/history": History,
  "/summary": Summary,
  "/settings": Settings,
  "/transaction": NewTransaction,
  "/transaction-detail": TransactionDetail,
  "/budget": Budget,
};
const titles = {
  "/": "Hari Ini",
  "/history": "Riwayat",
  "/summary": "Ringkasan",
  "/settings": "Pengaturan",
  "/transaction": "Catat transaksi",
  "/transaction-detail": "Detail transaksi",
  "/budget": "Atur budget",
};
const tabs = [
  ["/", "Hari Ini", "☀"],
  ["/history", "Riwayat", "◷"],
  ["/summary", "Ringkasan", "▥"],
  ["/settings", "Pengaturan", "⚙"],
];
function App() {
  const route = usePreviewRoute(),
    [width, setWidth] = useState(390);
  const Screen = routes[route.pathname] || Today;
  useEffect(() => {
    document.title = titles[route.pathname] + " · Catat Harian · Pratinjau UI";
  }, [route.pathname]);
  return (
    <>
      <div className="preview-warning" role="note">
        Pratinjau UI · data contoh · belum terhubung backend
      </div>
      <main className="preview-shell">
        <aside className="preview-intro">
          <div className="wordmark">
            <span className="app-mark">CH</span>CATAT HARIAN
          </div>
          <h1>
            Catatan kecil.
            <br />
            Hari lebih terarah.
          </h1>
          <p>
            Tinjau tampilan aplikasi Android dari layar yang sudah
            diimplementasikan.
          </p>
          <div className="preview-details">
            <span>YANG BISA DICOBA</span>
            <p>
              Beranda, riwayat, ringkasan, pengaturan, formulir transaksi, dan
              budget.
            </p>
            <p>
              Perubahan hanya berlaku selama halaman ini dibuka. Login Google,
              penyimpanan Sheets, dan notifikasi Android belum terhubung.
            </p>
          </div>
          <div className="width-controls" aria-label="Lebar pratinjau">
            {[360, 390, 430].map((size) => (
              <button
                key={size}
                className={width === size ? "selected" : ""}
                onClick={() => setWidth(size)}
              >
                {size} px
              </button>
            ))}
          </div>
          <button
            className="reset"
            onClick={() => {
              resetExamples();
              client.clear();
              router.replace("/");
            }}
          >
            Reset data contoh
          </button>
          <a
            href="https://github.com/hailgar/AppFinance/pull/2"
            target="_blank"
            rel="noreferrer"
          >
            Lihat source dan status proyek ↗
          </a>
        </aside>
        <section
          className="phone"
          style={{ "--phone-width": `${width}px` }}
          aria-label="Pratinjau layar aplikasi"
        >
          <header className="app-header">
            {route.pathname !== "/" && (
              <button aria-label="Kembali" onClick={() => router.back()}>
                ‹
              </button>
            )}
            <span>Catat Harian</span>
            <span className="sample-tag">CONTOH</span>
          </header>
          <div
            className="screen-container"
            key={route.pathname + JSON.stringify(route.params)}
          >
            <Screen />
          </div>
          <nav className="app-tabs" aria-label="Navigasi aplikasi">
            {tabs.map(([path, label, icon]) => (
              <button
                key={path}
                className={route.pathname === path ? "active" : ""}
                onClick={() => router.push(path)}
                aria-current={route.pathname === path ? "page" : undefined}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </nav>
        </section>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
);
