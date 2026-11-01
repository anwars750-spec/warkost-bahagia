export default function manifest() {
  return {
    id: "/",
    name: "Warkost Bahagia",
    short_name: "Warkost",
    description: "Pesanan dan operasional Warkost Bahagia",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#166534",
    icons: [
      { src: "/push-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/push-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
