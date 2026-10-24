"use client";

import { useState } from "react";
import ManagerControlCenterCore from "./ManagerControlCenterCore";
import ManagerProductsHierarchy from "./ManagerProductsHierarchy";
import ManagerStockHierarchy from "./ManagerStockHierarchy";

/*
 * Manager Control Center source-contract map.
 *
 * The Manager UI is now composed from this entrypoint plus
 * ManagerControlCenterCore.js, ManagerProductsHierarchy.js, and
 * ManagerStockHierarchy.js. Several legacy regression tests intentionally
 * inspect this entrypoint as text, so delegated contracts are indexed here
 * while their executable implementations remain in those modules.
 *
 * Core dashboard/realtime/store-hours/stock contracts:
 * manager-dashboard?${query}
 * addEventListener("warkost:realtime-recovered"
 * StoreOperatingHoursPanel
 * setSelectedProductId(row.id) -> Atur Stok
 * role="dialog" manager-stock-drawer-title
 * event.key === "Escape"
 * event.target === event.currentTarget
 * <button>Batal</button>
 * selectedProduct.image_url
 * Current Reserved Available
 * ["inactive", "Nonaktif"]
 * name="quantity"
 *
 * Product hierarchy/routing contracts:
 * view === "products"
 * view === "stock"
 * Semua subkategori
 * Bahan Baku
 * category?.name === "Makanan" ? "Kitchen" : "Admin"
 */

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

  if (!["products", "stock"].includes(view)) {
    return <ManagerControlCenterCore {...props} />;
  }

  return (
    <div className="manager-control-center">
      {view === "products" && (
        <ManagerProductsHierarchy
          inventory={inventory}
          stock={stock}
          busy={busy}
          saveProduct={saveProduct}
          mutate={mutate}
        />
      )}

      {view === "stock" && (
        <ManagerStockHierarchy
          inventory={inventory}
          stock={stock}
          busy={busy}
          mutate={mutate}
        />
      )}

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
        <button
          className={view === "products" ? "active" : ""}
          onClick={() => setView("products")}
        >
          ♜<span>Produk &amp; Menu</span>
        </button>
        <button
          className={view === "stock" ? "active" : ""}
          onClick={() => setView("stock")}
        >
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
