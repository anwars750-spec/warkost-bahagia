import "./style.css";
import "./admin-ui.css";
import "./admin-icons.css";
import "./admin-detail.css";
import "./admin-order-cards-v2.css";
import "./admin-order-number-v3.css";
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
import "./customer-support-chat-spacing.css";
import "./admin-printer-center.css";
import "./admin-notification-popover.css";
import "./admin-notification-popover-mobile-fix.css";
import "./admin-beverage-stock.css";
import "./admin-beverage-stock-polish.css";
import "./admin-beverage-stock-mobile-v3.css";
import "./admin-beverage-stock-mobile-kpi-center.css";
import "./admin-ui-stability.css";
import "./admin-nav-state-precision.css";
import "./admin-operational-scope-v2.css";
import "./cod-batch-settlement-polish.css";
import "./admin-cash-control.css";
import "./admin-cash-pin-feedback.css";
import "./admin-shift-gate.css";
import "./admin-shift-settlement.css";
import "./owner-admin-operators.css";
import "./kitchen-dashboard.css";
import "./kitchen-dashboard-queue-polish.css";
import "./kitchen-flash-guard.css";
import "./kitchen-dashboard-mobile-v2.css";
import "./printer-header-frame-fix.css";
import "./kitchen-header-actions.css";
import "./kitchen-stock-center.css";
import "./kitchen-stock-final-sync.css";
import "./kitchen-nav-stability.css";
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
import "./manager-stock-action-green.css";
import "./manager-stock-drawer-v2.css";
import "./manager-notification-popover.css";
import "./manager-promotion-center.css";
import "./manager-promotion-ui-polish.css";
import "./manager-promotion-actions-polish.css";
import "./manager-promotion-icon-single-fix.css";
import "./manager-promotion-drawer-v2.css";
import "./manager-cash-settlement.css";
import "./driver-control-center-v2.css";
import "./driver-home-cod-dedupe.css";
import "./driver-runtime-transition.css";
import "./driver-mobile-final.css";
import "./driver-mobile-icon-precision.css";
import "./driver-logo-fix.css";
import "./driver-communication.css";
import "./driver-cod-close-precision.css";
import "./cash-settlement-ui-v2.css";
import "./manager-owner-settlement.css";
import "./manager-owner-settlement-v2.css";
import "./owner-dashboard-v1.css";
import "./owner-dashboard-v2.css";
import "./owner-dashboard-v3.css";
import "./owner-navigation-v2.css";
import "./print-branding.css";
import DriverRuntimeBootstrap from "./DriverRuntimeBootstrap";
import DriverLogoFix from "./DriverLogoFix";
import AdminCodBatchEventBridge from "./AdminCodBatchEventBridge";
import AdminCodLauncherButton from "./AdminCodLauncherButton";
import AdminCashControlCenter from "./AdminCashControlCenter";
import AdminShiftGateRuntime from "./AdminShiftGateRuntime";
import AdminShiftSettlementRuntime from "./AdminShiftSettlementRuntime";
import AdminSettlementStabilityBridge from "./AdminSettlementStabilityBridge";
import AdminOrderNumberEnhancer from "./AdminOrderNumberEnhancer";
import OwnerAdminOperatorCenter from "./OwnerAdminOperatorCenter";
import OwnerDashboardRuntime from "./OwnerDashboardRuntime";
import OwnerNavigationRuntime from "./OwnerNavigationRuntime";
import ManagerCashSettlementCenter from "./ManagerCashSettlementCenter";
import ManagerOwnerSettlementCenter from "./ManagerOwnerSettlementCenter";
import ManagerCashSyncBridge from "./ManagerCashSyncBridge";
import PrintBrandingRuntime from "./PrintBrandingRuntime";
import KitchenDashboardFast from "./KitchenDashboardFast";
import KitchenFlashGuard from "./KitchenFlashGuard";
import PrinterCenterRuntime from "./PrinterCenterRuntime";
import KitchenHeaderActions from "./KitchenHeaderActions";
import KitchenStockCenter from "./KitchenStockCenter";
import KitchenStockImageSync from "./KitchenStockImageSync";
import RoleLogoutConfirmation from "./RoleLogoutConfirmation";
import CustomerCatalogPolish from "./CustomerCatalogPolish";
import CustomerQuantityUnitPolish from "./CustomerQuantityUnitPolish";
import CustomerHelpRoutingRuntime from "./CustomerHelpRoutingRuntime";
import CustomerGeneralSupportRuntime from "./CustomerGeneralSupportRuntime";
import ManagerDashboardUiPolish from "./ManagerDashboardUiPolish";
import ManagerSubcategoryPolish from "./ManagerSubcategoryPolish";
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
        <DriverRuntimeBootstrap />
        <DriverLogoFix />
        <KitchenFlashGuard />
        <KitchenDashboardFast />
        <AdminCodBatchEventBridge />
        <AdminCodLauncherButton />
        <AdminCashControlCenter />
        <AdminShiftGateRuntime />
        <AdminShiftSettlementRuntime />
        <AdminSettlementStabilityBridge />
        <AdminOrderNumberEnhancer />
        <OwnerAdminOperatorCenter />
        <OwnerDashboardRuntime />
        <OwnerNavigationRuntime />
        <ManagerCashSettlementCenter />
        <ManagerOwnerSettlementCenter />
        <ManagerCashSyncBridge />
        <PrintBrandingRuntime />
        <PrinterCenterRuntime />
        <KitchenHeaderActions />
        <KitchenStockCenter />
        <KitchenStockImageSync />
        <RoleLogoutConfirmation />
        <CustomerCatalogPolish />
        <CustomerQuantityUnitPolish />
        <CustomerHelpRoutingRuntime />
        <CustomerGeneralSupportRuntime />
        <ManagerDashboardUiPolish />
        <ManagerSubcategoryPolish />
        <ManagerNotificationPopover />
        <ManagerNotificationOutsideClose />
        <div id="admin-ui-portal-root" />
      </body>
    </html>
  );
}
