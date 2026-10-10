import "./style.css";
import "./admin-ui.css";
import "./admin-icons.css";
import "./admin-detail.css";
import "./admin-order-cards-v2.css";
import "./admin-order-modal.css";
import "./admin-order-modal-close-fix.css";
import "./admin-order-modal-fallback.css";
import "./admin-cod-settlement.css";
import "./cod-batch-settlement-center.css";
import "./admin-cod-launcher-button.css";
import "./admin-operational-hotfix.css";
import "./admin-customers.css";
import "./admin-customers-polish.css";
import "./admin-customer-modal-polish.css";
import "./admin-customer-service-mobile.css";
import "./admin-customer-service-mobile-final.css";
import "./communication.css";
import "./admin-printer-center.css";
import "./admin-notification-popover.css";
import "./admin-notification-popover-mobile-fix.css";
import "./admin-beverage-stock.css";
import "./admin-beverage-stock-polish.css";
import "./admin-beverage-stock-mobile-v3.css";
import "./admin-beverage-stock-mobile-kpi-center.css";
import "./admin-ui-stability.css";
import "./cod-batch-settlement-polish.css";
import "./kitchen-dashboard.css";
import "./kitchen-dashboard-queue-polish.css";
import "./kitchen-flash-guard.css";
import "./kitchen-dashboard-mobile-v2.css";
import "./printer-header-frame-fix.css";
import "./kitchen-header-actions.css";
import "./customer-quantity-mobile-polish.css";
import "./customer-catalog-polish.css";
import "./customer-catalog-final-polish.css";
import "./customer-quantity-unit-final.css";
import "./manager-control-center.css";
import "./manager-dashboard-ui-polish.css";
import "./manager-dashboard-title-size.css";
import "./manager-icon-precision.css";
import "./manager-products-ui-polish.css";
import "./manager-products-final-fix.css";
import "./manager-products-mobile-v2.css";
import "./manager-subcategory-polish.css";
import "./manager-subcategory-final-polish.css";
import "./manager-stock-polish.css";
import "./manager-notification-popover.css";
import "./manager-promotion-center.css";
import "./manager-promotion-ui-polish.css";
import "./manager-promotion-actions-polish.css";
import CodBatchSettlementCenter from "./CodBatchSettlementCenter";
import DriverCodBatchEventBridge from "./DriverCodBatchEventBridge";
import AdminCodBatchEventBridge from "./AdminCodBatchEventBridge";
import AdminCodLauncherButton from "./AdminCodLauncherButton";
import KitchenDashboardFast from "./KitchenDashboardFast";
import KitchenFlashGuard from "./KitchenFlashGuard";
import PrinterCenterRuntime from "./PrinterCenterRuntime";
import KitchenHeaderActions from "./KitchenHeaderActions";
import RoleLogoutConfirmation from "./RoleLogoutConfirmation";
import CustomerCatalogPolish from "./CustomerCatalogPolish";
import CustomerQuantityUnitPolish from "./CustomerQuantityUnitPolish";
import ManagerDashboardUiPolish from "./ManagerDashboardUiPolish";
import ManagerSubcategoryPolish from "./ManagerSubcategoryPolish";
import ManagerStockPolish from "./ManagerStockPolish";
import ManagerNotificationPopover from "./ManagerNotificationPopover";
import ManagerNotificationOutsideClose from "./ManagerNotificationOutsideClose";

export const metadata = {
  title: "Warkost Bahagia",
  description: "Pesan makanan dan pantau pengantaran Warkost Bahagia",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
        <KitchenFlashGuard />
        <KitchenDashboardFast />
        <CodBatchSettlementCenter />
        <DriverCodBatchEventBridge />
        <AdminCodBatchEventBridge />
        <AdminCodLauncherButton />
        <PrinterCenterRuntime />
        <KitchenHeaderActions />
        <RoleLogoutConfirmation />
        <CustomerCatalogPolish />
        <CustomerQuantityUnitPolish />
        <ManagerDashboardUiPolish />
        <ManagerSubcategoryPolish />
        <ManagerStockPolish />
        <ManagerNotificationPopover />
        <ManagerNotificationOutsideClose />
        <div id="admin-ui-portal-root" />
      </body>
    </html>
  );
}
