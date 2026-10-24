"use client";

import { useState } from "react";
import ManagerControlCenterCore from "./ManagerControlCenterCore";
import ManagerProductsHierarchy from "./ManagerProductsHierarchy";

export default function ManagerControlCenter(props) {
  const {
    view,
    setView,
    api,
    inventory,
    stock,
    busy,
    run,
    saveProduct,
    logout,
  } = props;
  const [moreOpen, setMoreOpen] = useState(false);

  const mutate = async (action, body) => {
    let succeeded = false;
    await run(async () => {
      await api(action, body);
      succeeded = true;
    });
    return succeeded;
  };

  if (view !== "products") {
    return <ManagerControlCenterCore {...props} />;
  }

  return (
    <div className="manager-control-center">
      <ManagerProductsHierarchy
        inventory={inventory}
        stock={stock}
        busy={busy}
        saveProduct={saveProduct}
        mutate={mutate}
      />

      {moreOpen && (
        <div className="manager-more-menu">
          <button
            onClick={() => {
              setView("subcategories");
              setMoreOpen(false);
            }}
          >
            Subkategori
          </button>
          <button
            onClick={() => {
              setView("store-hours");
              setMoreOpen(false);
            }}
          >
            Jam Operasional
          </button>
          <button
            onClick={() => {
              setView("notifications");
              setMoreOpen(false);
            }}
          >
            Notifikasi
          </button>
          <button onClick={logout}>Keluar</button>
        </div>
      )}

      <nav className="manager-mobile-nav" aria-label="Navigasi Manager mobile">
        <button onClick={() => setView("manager-dashboard")}>
          ⌂<span>Dashboard</span>
        </button>
        <button className="active" onClick={() => setView("products")}>
          ♜<span>Produk &amp; Menu</span>
        </button>
        <button onClick={() => setView("stock")}>
          ◇<span>Stok</span>
        </button>
        <button onClick={() => setView("promotions")}>
          ⌑<span>Promo</span>
        </button>
        <button
          className={
            ["subcategories", "store-hours", "notifications"].includes(view)
              ? "active"
              : ""
          }
          onClick={() => setMoreOpen((open) => !open)}
        >
          •••<span>Lainnya</span>
        </button>
      </nav>
    </div>
  );
}
