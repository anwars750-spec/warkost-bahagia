import "./style.css";
import "./admin-ui.css";
import "./admin-icons.css";
import "./admin-detail.css";
import "./admin-order-cards-v2.css";
import "./admin-order-modal.css";
import "./admin-order-modal-close-fix.css";
import "./admin-order-modal-fallback.css";
import "./admin-customers.css";
import "./admin-customers-polish.css";
import AdminUiEnhancer from "./AdminUiEnhancer";
import AdminOrderCardEnhancer from "./AdminOrderCardEnhancer";
import AdminOrderModalEnhancer from "./AdminOrderModalEnhancer";
import AdminCustomersEnhancer from "./AdminCustomersEnhancer";

export const metadata = {
  title: "Warkost Bahagia",
  description: "Pesan makanan dan pantau pengantaran Warkost Bahagia",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <AdminUiEnhancer />
        <AdminOrderCardEnhancer />
        <AdminOrderModalEnhancer />
        <AdminCustomersEnhancer />
        {children}
      </body>
    </html>
  );
}
