import "./style.css";
import "./admin-ui.css";
import "./admin-icons.css";
import "./admin-detail.css";
import "./admin-order-cards-v2.css";
import AdminUiEnhancer from "./AdminUiEnhancer";
import AdminOrderCardEnhancer from "./AdminOrderCardEnhancer";

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
        {children}
      </body>
    </html>
  );
}
