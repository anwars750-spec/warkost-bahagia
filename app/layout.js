import "./style.css";
import "./admin-ui.css";
import "./admin-icons.css";
import "./admin-detail.css";
import "./admin-order-cards-v2.css";
import "./admin-order-modal.css";
import "./admin-order-modal-close-fix.css";
import "./admin-order-modal-fallback.css";
import "./admin-cod-settlement.css";
import "./admin-operational-hotfix.css";
import "./admin-customers.css";
import "./admin-customers-polish.css";
import "./admin-customer-modal-polish.css";
import "./admin-customer-service-mobile.css";
import "./admin-customer-service-mobile-final.css";
import "./admin-printer-center.css";
import "./admin-notification-popover.css";
import "./admin-notification-popover-mobile-fix.css";
import "./admin-beverage-stock.css";
import "./admin-beverage-stock-polish.css";
import "./admin-beverage-stock-mobile-v3.css";
import "./admin-beverage-stock-mobile-kpi-center.css";
import "./admin-ui-stability.css";
import AdminCodSettlementShortcut from "./AdminCodSettlementShortcut";
import AdminOrderFilterGuard from "./AdminOrderFilterGuard";

export const metadata = {
  title: "Warkost Bahagia",
  description: "Pesan makanan dan pantau pengantaran Warkost Bahagia",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
        <AdminCodSettlementShortcut />
        <AdminOrderFilterGuard />
        <div id="admin-ui-portal-root" />
      </body>
    </html>
  );
}
