"use client";

import { useEffect } from "react";

const MENU_META = {
  Dashboard: { icon: "home", group: "primary" },
  Pelanggan: { icon: "users", group: "primary" },
  Produk: { icon: "box", group: "secondary" },
  Promo: { icon: "tag", group: "secondary" },
  Pengaturan: { icon: "settings", group: "secondary" },
  Loyalty: { icon: "star", group: "secondary" },
  Stok: { icon: "archive", group: "primary" },
  "Operator Admin": { icon: "shield", group: "secondary" },
  "Setoran Kas": { icon: "cash", group: "primary", accent: true },
  Staf: { icon: "staff", group: "secondary" },
  "Audit log": { icon: "history", group: "secondary" },
  Printer: { icon: "printer", group: "secondary" },
  Laporan: { icon: "chart", group: "primary" },
  Notifikasi: { icon: "bell", group: "secondary" },
  Keluar: { icon: "logout", group: "logout" },
};

const ICON_PATHS = {
  home: ["M3 11.5 12 4l9 7.5", "M5.5 10.5V20h13v-9.5", "M9 20v-6h6v6"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  box: ["M4 7 12 3l8 4v10l-8 4-8-4V7Z", "M4 7l8 4 8-4", "M12 11v10"],
  tag: ["M20 13 13 20 4 11V4h7l9 9Z", "M8.5 8.5h.01"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 3.46-.08-.03a1.7 1.7 0 0 0-1.91.25l-.2.12a1.7 1.7 0 0 0-.82 1.53V22h-4v-.09a1.7 1.7 0 0 0-.82-1.53l-.2-.12a1.7 1.7 0 0 0-1.91-.25l-.08.03-2-3.46.06-.06A1.7 1.7 0 0 0 5.6 15l-.12-.2A1.7 1.7 0 0 0 4 14H4v-4h.09a1.7 1.7 0 0 0 1.48-.8l.12-.2a1.7 1.7 0 0 0-.25-1.91l-.06-.06 2-3.46.08.03a1.7 1.7 0 0 0 1.91-.25l.2-.12A1.7 1.7 0 0 0 10.39 2H14v.09a1.7 1.7 0 0 0 .82 1.53l.2.12a1.7 1.7 0 0 0 1.91.25l.08-.03 2 3.46-.06.06A1.7 1.7 0 0 0 18.7 9l.12.2A1.7 1.7 0 0 0 20.3 10H20v4h-.09a1.7 1.7 0 0 0-1.48.8l-.12.2Z"],
  star: ["m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"],
  archive: ["M4 5h16v4H4z", "M6 9v10h12V9", "M9 13h6"],
  shield: ["M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z", "M9 12l2 2 4-4"],
  cash: ["M3 7h18v10H3z", "M7 12h.01", "M17 12h.01", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"],
  staff: ["M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M5 21a7 7 0 0 1 14 0", "M19 8v4", "M17 10h4"],
  history: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  printer: ["M6 9V4h12v5", "M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2", "M6 14h12v6H6z"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20V7"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  logout: ["M10 17l5-5-5-5", "M15 12H3", "M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6 6 18"],
};

function normalizeLabel(button) {
  const ownText = [...button.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join(" ")
    .trim();
  if (ownText) return ownText.replace(/\s+/g, " ");
  return String(button.textContent || "")
    .replace(/\s+/g, " ")
    .replace(/^Rp\s*/i, "")
    .trim();
}

function makeIcon(name) {
  const span = document.createElement("span");
  span.className = "owner-nav-icon-v2";
  span.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  (ICON_PATHS[name] || ICON_PATHS.home).forEach((pathValue) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathValue);
    svg.appendChild(path);
  });
  span.appendChild(svg);
  return span;
}

function decorateButton(button, label, meta) {
  button.dataset.ownerNavKey = label;
  button.dataset.ownerNavGroup = meta.group;
  if (meta.accent) button.dataset.ownerNavAccent = "true";
  if (!button.querySelector(":scope > .owner-nav-icon-v2")) {
    button.prepend(makeIcon(meta.icon));
  }
}

function makeRuntimeButton(label, meta, original, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `owner-nav-runtime-button ${extraClass}`.trim();
  button.dataset.ownerNavKey = label;
  if (meta.accent) button.dataset.ownerNavAccent = "true";
  button.appendChild(makeIcon(meta.icon));
  const text = document.createElement("span");
  text.className = "owner-nav-runtime-label";
  text.textContent = label;
  button.appendChild(text);
  button.addEventListener("click", () => {
    original.click();
    document.body.classList.remove("owner-nav-more-open", "owner-nav-mobile-open");
  });
  return button;
}

function isOwnerNav(nav) {
  const labels = [...nav.querySelectorAll(":scope > button")].map(normalizeLabel);
  return labels.includes("Dashboard") && labels.includes("Setoran Kas") && labels.includes("Operator Admin");
}

export default function OwnerNavigationRuntime() {
  useEffect(() => {
    let morePanel = null;
    let moreToggle = null;
    let mobileToggle = null;
    let mobileDrawer = null;
    let mobileBackdrop = null;
    let lastSignature = "";

    const closeMenus = () => {
      document.body.classList.remove("owner-nav-more-open", "owner-nav-mobile-open");
      moreToggle?.setAttribute("aria-expanded", "false");
      mobileToggle?.setAttribute("aria-expanded", "false");
    };

    const cleanupRuntimeNodes = () => {
      morePanel?.remove();
      moreToggle?.remove();
      mobileToggle?.remove();
      mobileDrawer?.remove();
      mobileBackdrop?.remove();
      morePanel = null;
      moreToggle = null;
      mobileToggle = null;
      mobileDrawer = null;
      mobileBackdrop = null;
    };

    const setActive = (label) => {
      document.querySelectorAll("[data-owner-nav-key]").forEach((item) => {
        const active = item.dataset.ownerNavKey === label;
        item.classList.toggle("owner-nav-active", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      sessionStorage.setItem("warkost-owner-nav-active", label);
    };

    const buildRuntimeMenus = (header, nav, entries) => {
      cleanupRuntimeNodes();
      const secondaryEntries = entries.filter((entry) => entry.meta.group === "secondary");

      moreToggle = document.createElement("button");
      moreToggle.type = "button";
      moreToggle.className = "owner-nav-more-toggle";
      moreToggle.setAttribute("aria-expanded", "false");
      moreToggle.appendChild(makeIcon("more"));
      const moreText = document.createElement("span");
      moreText.textContent = "Lainnya";
      moreToggle.appendChild(moreText);
      moreToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = !document.body.classList.contains("owner-nav-more-open");
        closeMenus();
        document.body.classList.toggle("owner-nav-more-open", open);
        moreToggle.setAttribute("aria-expanded", String(open));
      });
      nav.appendChild(moreToggle);

      morePanel = document.createElement("div");
      morePanel.className = "owner-nav-more-panel";
      const panelTitle = document.createElement("div");
      panelTitle.className = "owner-nav-panel-title";
      panelTitle.textContent = "Menu Owner";
      morePanel.appendChild(panelTitle);
      const panelGrid = document.createElement("div");
      panelGrid.className = "owner-nav-panel-grid";
      secondaryEntries.forEach(({ label, meta, button }) => {
        panelGrid.appendChild(makeRuntimeButton(label, meta, button));
      });
      morePanel.appendChild(panelGrid);
      nav.appendChild(morePanel);

      mobileToggle = document.createElement("button");
      mobileToggle.type = "button";
      mobileToggle.className = "owner-nav-mobile-toggle";
      mobileToggle.setAttribute("aria-label", "Buka menu Owner");
      mobileToggle.setAttribute("aria-expanded", "false");
      mobileToggle.appendChild(makeIcon("menu"));
      const mobileText = document.createElement("span");
      mobileText.textContent = "Menu";
      mobileToggle.appendChild(mobileText);
      mobileToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = !document.body.classList.contains("owner-nav-mobile-open");
        closeMenus();
        document.body.classList.toggle("owner-nav-mobile-open", open);
        mobileToggle.setAttribute("aria-expanded", String(open));
      });
      header.appendChild(mobileToggle);

      mobileBackdrop = document.createElement("div");
      mobileBackdrop.className = "owner-nav-mobile-backdrop";
      mobileBackdrop.addEventListener("click", closeMenus);
      document.body.appendChild(mobileBackdrop);

      mobileDrawer = document.createElement("aside");
      mobileDrawer.className = "owner-nav-mobile-drawer";
      mobileDrawer.setAttribute("aria-label", "Menu Owner");
      const mobileHead = document.createElement("div");
      mobileHead.className = "owner-nav-mobile-head";
      const mobileHeadCopy = document.createElement("div");
      const mobileKicker = document.createElement("small");
      mobileKicker.textContent = "OWNER CONTROL";
      const mobileTitle = document.createElement("strong");
      mobileTitle.textContent = "Menu Warkost";
      mobileHeadCopy.append(mobileKicker, mobileTitle);
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", "Tutup menu Owner");
      closeButton.appendChild(makeIcon("close"));
      closeButton.addEventListener("click", closeMenus);
      mobileHead.append(mobileHeadCopy, closeButton);
      mobileDrawer.appendChild(mobileHead);

      const groups = [
        ["Utama", entries.filter((entry) => entry.meta.group === "primary")],
        ["Pengelolaan", secondaryEntries],
        ["Akun", entries.filter((entry) => entry.meta.group === "logout")],
      ];
      groups.forEach(([title, groupEntries]) => {
        if (!groupEntries.length) return;
        const section = document.createElement("section");
        section.className = "owner-nav-mobile-section";
        const heading = document.createElement("small");
        heading.textContent = title;
        section.appendChild(heading);
        const grid = document.createElement("div");
        grid.className = "owner-nav-mobile-grid";
        groupEntries.forEach(({ label, meta, button }) => {
          grid.appendChild(makeRuntimeButton(label, meta, button, "owner-nav-mobile-item"));
        });
        section.appendChild(grid);
        mobileDrawer.appendChild(section);
      });
      document.body.appendChild(mobileDrawer);
    };

    const sync = () => {
      const header = document.querySelector("header.top");
      const nav = header?.querySelector(":scope > nav");
      if (!header || !nav || !isOwnerNav(nav)) {
        document.body.classList.remove("owner-navigation-v2-active");
        closeMenus();
        cleanupRuntimeNodes();
        lastSignature = "";
        return;
      }

      document.body.classList.add("owner-navigation-v2-active");
      nav.classList.add("owner-nav-v2");

      const entries = [...nav.querySelectorAll(":scope > button")]
        .map((button) => {
          const label = normalizeLabel(button);
          const meta = MENU_META[label];
          return meta ? { label, meta, button } : null;
        })
        .filter(Boolean);

      entries.forEach(({ label, meta, button }) => {
        decorateButton(button, label, meta);
        if (!button.dataset.ownerNavClickBound) {
          button.dataset.ownerNavClickBound = "true";
          button.addEventListener("click", () => {
            if (!["Keluar", "Operator Admin", "Setoran Kas"].includes(label)) {
              setActive(label);
            }
            closeMenus();
          });
        }
      });

      const signature = entries.map(({ label }) => label).join("|");
      if (signature !== lastSignature || !morePanel?.isConnected || !mobileDrawer?.isConnected) {
        buildRuntimeMenus(header, nav, entries);
        lastSignature = signature;
      }

      const storedActive = sessionStorage.getItem("warkost-owner-nav-active");
      const known = entries.some(({ label }) => label === storedActive);
      setActive(known ? storedActive : "Dashboard");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    const onDocumentClick = (event) => {
      if (
        !event.target.closest(".owner-nav-more-panel") &&
        !event.target.closest(".owner-nav-more-toggle") &&
        !event.target.closest(".owner-nav-mobile-drawer") &&
        !event.target.closest(".owner-nav-mobile-toggle")
      ) {
        closeMenus();
      }
    };
    document.addEventListener("click", onDocumentClick);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onDocumentClick);
      document.body.classList.remove(
        "owner-navigation-v2-active",
        "owner-nav-more-open",
        "owner-nav-mobile-open",
      );
      document.querySelector("header.top nav")?.classList.remove("owner-nav-v2");
      cleanupRuntimeNodes();
    };
  }, []);

  return null;
}
