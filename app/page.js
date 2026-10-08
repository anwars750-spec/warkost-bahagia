"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import AdminBeverageStockEnhancerV2 from "./AdminBeverageStockEnhancerV2";
import AdminBeverageStockPolish from "./AdminBeverageStockPolish";
import AdminCustomersEnhancer from "./AdminCustomersEnhancer";
import AdminCustomerService from "./AdminCustomerService";
import AdminNotificationPopover from "./AdminNotificationPopover";
import AdminOrderCardEnhancer from "./AdminOrderCardEnhancer";
import AdminOrderModalEnhancer from "./AdminOrderModalEnhancer";
import AdminPrinterController from "./AdminPrinterController";
import AdminUiEnhancer from "./AdminUiEnhancer";
import ConversationChat from "./ConversationChat";
import {
  ADMIN_ORDER_FILTERS,
  adminOrderCounts,
  filterAdminOrders,
} from "../lib/admin-order-filter.mjs";
const money = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");
const whatsappLink = (number, text) =>
  `https://wa.me/${String(number || "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
const localDateTime = (value) => {
  const date = value
    ? new Date(
        typeof value === "number"
          ? value
          : String(value).replace(" ", "T") + "Z",
      )
    : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const promoDate = (value) =>
  new Date(String(value).replace(" ", "T") + "Z").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const demoProductImage = (name) => {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("nasi goreng"))
    return "/demo/nasi-goreng-warkost.webp";
  if (normalized.includes("mie ayam")) return "/demo/mie-ayam-bahagia.webp";
  if (normalized.includes("kopi susu")) return "/demo/kopi-susu-rumah.webp";
  return "/demo/promo-warkost.webp";
};
const demoProductBadges = [
  ["★", "Best Seller", "best-seller"],
  ["●", "Populer", "popular"],
  ["♛", "Rekomendasi", "recommended"],
];
const ORDER_STAGES = [
  { key: "received", label: "Diterima" },
  { key: "preparing", label: "Diproses" },
  { key: "delivery", label: "Diantar" },
  { key: "delivered", label: "Sampai" },
];
const orderStage = (status) => {
  if (["PENDING", "CONFIRMED"].includes(status)) return 0;
  if (["PREPARING", "READY"].includes(status)) return 1;
  if (["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(status)) return 2;
  if (status === "DELIVERED") return 3;
  return -1;
};
const orderStatusMeta = (status) => {
  const statuses = {
    PENDING: ["Pesanan Diterima", "pending"],
    CONFIRMED: ["Pesanan Dikonfirmasi", "pending"],
    PREPARING: ["Dalam Proses", "process"],
    READY: ["Siap Diantar", "process"],
    ASSIGNED: ["Driver Ditugaskan", "delivery"],
    PICKED_UP: ["Pesanan Diambil", "delivery"],
    ON_DELIVERY: ["Dalam Pengantaran", "delivery"],
    DELIVERED: ["Selesai", "done"],
    CANCELLED: ["Dibatalkan", "cancelled"],
  };
  const [label, tone] = statuses[status] || [
    String(status || "Pesanan").replaceAll("_", " "),
    "pending",
  ];
  return { label, tone };
};
const orderHeadline = (status) => {
  if (["PENDING", "CONFIRMED"].includes(status))
    return "Pesanan sudah kami terima";
  if (["PREPARING", "READY"].includes(status))
    return "Pesanan sedang diproses oleh dapur";
  if (["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(status))
    return "Pesanan sedang menuju alamatmu";
  if (status === "DELIVERED") return "Pesanan telah selesai diantar";
  if (status === "CANCELLED") return "Pesanan dibatalkan";
  return "Status pesanan diperbarui";
};
const formatDateTime = (value) => {
  if (!value) return "";
  const parsed = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const notificationCategory = (message) => {
  const normalized = String(message || "").toLowerCase();
  if (/promo|voucher|diskon|poin/.test(normalized)) return "promo";
  if (/pesanan|driver|dapur|pengantaran|pembayaran/.test(normalized))
    return "order";
  return "system";
};
const notificationTitle = (message) => {
  const category = notificationCategory(message);
  if (category === "promo")
    return /poin/i.test(message) ? "Poin Warkost" : "Promo Warkost";
  if (category === "order")
    return /driver|pengantaran/i.test(message)
      ? "Info Pengantaran"
      : "Status Pesanan";
  return "Informasi Akun";
};
async function api(route, body, signal) {
  const response = await fetch("/api/" + route, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Gagal memuat");
  return data;
}
export default function App() {
  const checkoutAttempt = useRef(null);
  const quickAddressAttempt = useRef(false);
  const pollController = useRef(null);
  const refreshController = useRef(null);
  const messageTimer = useRef(null);
  const [user, setUser] = useState(null),
    [menu, setMenu] = useState({
      products: [],
      categories: [],
      brand: "Warkost Bahagia",
    }),
    [orders, setOrders] = useState([]),
    [nextOrderCursor, setNextOrderCursor] = useState(null),
    [alerts, setAlerts] = useState({ notifications: [], unread: 0 }),
    [account, setAccount] = useState({
      profile: null,
      addresses: [],
      loyalty: 0,
      transactions: [],
      vouchers: [],
      rewards: [],
    }),
    [staff, setStaff] = useState([]),
    [customers, setCustomers] = useState([]),
    [customerCursor, setCustomerCursor] = useState(null),
    [customerSearch, setCustomerSearch] = useState(""),
    [inventory, setInventory] = useState({ products: [], categories: [] }),
    [dashboard, setDashboard] = useState(null),
    [stock, setStock] = useState({ products: [], movements: [] }),
    [audit, setAudit] = useState({ logs: [], nextCursor: null }),
    [report, setReport] = useState(null),
    [printJobs, setPrintJobs] = useState([]),
    [promotions, setPromotions] = useState([]),
    [loyaltyRules, setLoyaltyRules] = useState([]),
    [settings, setSettings] = useState({
      brandName: "Warkost Bahagia",
      rupiahPerPoint: 10000,
      businessWhatsApp: "6281546407856",
      businessLatitude: -6.9217,
      businessLongitude: 106.9272,
      deliveryFreeKm: 5,
      deliveryFeePerKm: 2500,
      deliveryMaxKm: 15,
      printerSimulation: true,
      adminPrinter: "LAN 80mm Admin (simulasi)",
      kitchenPrinter: "LAN 80mm Kitchen (simulasi)",
    }),
    [cart, setCart] = useState({}),
    [view, setView] = useState("menu"),
    [mode, setMode] = useState("login"),
    [passwordVisibility, setPasswordVisibility] = useState({
      login: false,
      register: false,
      confirmation: false,
      reset: false,
      resetConfirmation: false,
    }),
    [otpFlow, setOtpFlow] = useState(null),
    [authClock, setAuthClock] = useState(Date.now()),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editingAddress, setEditingAddress] = useState(null),
    [selectedCategory, setSelectedCategory] = useState(0),
    [productSearch, setProductSearch] = useState(""),
    [promoIndex, setPromoIndex] = useState(0),
    [overlay, setOverlay] = useState(null),
    [supportTopic, setSupportTopic] = useState(null),
    [orderFilter, setOrderFilter] = useState("all"),
    [adminOrderFilter, setAdminOrderFilter] = useState("all"),
    [adminOrderSearch, setAdminOrderSearch] = useState(""),
    [notificationFilter, setNotificationFilter] = useState("all"),
    [lastCreatedOrderId, setLastCreatedOrderId] = useState(null),
    [focusedOrderId, setFocusedOrderId] = useState(null),
    [supportOrderId, setSupportOrderId] = useState(null),
    [chatTarget, setChatTarget] = useState(null),
    [checkoutAddressId, setCheckoutAddressId] = useState(""),
    [deliveryQuote, setDeliveryQuote] = useState(null),
    [deliveryQuoteBusy, setDeliveryQuoteBusy] = useState(false),
    [deliveryQuoteError, setDeliveryQuoteError] = useState(""),
    [quickAddressOpen, setQuickAddressOpen] = useState(false),
    [quickAddressBusy, setQuickAddressBusy] = useState(false),
    [selectedVoucherId, setSelectedVoucherId] = useState(null),
    [voucherQuote, setVoucherQuote] = useState(null),
    [voucherQuoteBusy, setVoucherQuoteBusy] = useState(false),
    [voucherQuoteError, setVoucherQuoteError] = useState(""),
    [selectedRewardId, setSelectedRewardId] = useState(null),
    [loyaltyQuote, setLoyaltyQuote] = useState(null),
    [loyaltyQuoteBusy, setLoyaltyQuoteBusy] = useState(false),
    [loyaltyQuoteError, setLoyaltyQuoteError] = useState("");
  async function loadCustomers(query = "", before = null, signal) {
    const page = await api(
      "customers?q=" +
        encodeURIComponent(query) +
        (before === null ? "" : "&before=" + before),
      undefined,
      signal,
    );
    setCustomers((previous) =>
      before === null ? page.customers : [...previous, ...page.customers],
    );
    setCustomerCursor(page.nextCursor);
  }
  function saveProductWithImage(body, file) {
    return run(async () => {
      if (file?.size > 0) {
        const form = new FormData();
        form.append("image", file);
        const response = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "Gagal mengunggah gambar");
        body.imageUrl = result.url;
      }
      await api("product", body);
    });
  }
  async function refresh() {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    const signal = controller.signal;
    try {
      const [m, me] = await Promise.all([
        api("menu", undefined, signal),
        api("me", undefined, signal),
      ]);
      setMenu(m);
      setUser(me.user);
      if (me.user && me.user.role !== "CUSTOMER")
        setView((prev) =>
          prev === "menu"
            ? me.user.role === "MANAGER"
              ? "products"
              : "orders"
            : prev,
        );
      if (me.user) {
        if (me.user.role !== "MANAGER") {
          const o = await api("orders", undefined, signal);
          setOrders(o.orders);
          setNextOrderCursor(o.nextCursor);
        } else {
          setOrders([]);
          setNextOrderCursor(null);
        }
        setAlerts(await api("notifications", undefined, signal));
        if (me.user.role === "CUSTOMER")
          setAccount(await api("account", undefined, signal));
        if (["ADMIN", "OWNER"].includes(me.user.role)) {
          setDashboard(await api("dashboard", undefined, signal));
          if (view === "reports")
            setReport(
              await api(
                "report?date=" + (report?.date || ""),
                undefined,
                signal,
              ),
            );
          await loadCustomers(customerSearch, null, signal);
          if (me.user.role === "OWNER") {
            setStaff((await api("staff", undefined, signal)).staff);
            setAudit(await api("audit", undefined, signal));
            setSettings(await api("settings", undefined, signal));
            setLoyaltyRules(
              (await api("loyalty-rewards", undefined, signal)).rewards,
            );
          }
        }
        if (["MANAGER", "OWNER"].includes(me.user.role)) {
          setInventory(await api("inventory", undefined, signal));
          setStock(await api("stock", undefined, signal));
          setPromotions(
            (await api("promotions", undefined, signal)).promotions,
          );
        }
        if (["ADMIN", "KITCHEN", "OWNER"].includes(me.user.role))
          setPrintJobs((await api("print-jobs", undefined, signal)).jobs);
      } else {
        setOrders([]);
        setNextOrderCursor(null);
        setCustomers([]);
        setCustomerSearch("");
      }
    } catch (error) {
      if (error.name !== "AbortError") throw error;
    } finally {
      if (refreshController.current === controller)
        refreshController.current = null;
    }
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!otpFlow || view !== "auth") return;
    const timer = setInterval(() => setAuthClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [otpFlow, view]);
  useEffect(() => {
    if (!user) return;
    let running = false;
    const controller = new AbortController();
    pollController.current = controller;
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden" || running) return;
      running = true;
      try {
        const latestAlerts = await api(
          "notifications",
          undefined,
          controller.signal,
        );
        if (user.role !== "MANAGER") {
          const latestOrders = await api(
            "orders",
            undefined,
            controller.signal,
          );
          setOrders((previous) => {
            const fresh = new Set(latestOrders.orders.map((order) => order.id));
            return [
              ...latestOrders.orders,
              ...previous.filter((order) => !fresh.has(order.id)),
            ].sort((a, b) => b.id - a.id);
          });
          setNextOrderCursor((cursor) =>
            cursor === null
              ? null
              : Math.min(cursor, latestOrders.nextCursor ?? cursor),
          );
        }
        setAlerts(latestAlerts);
        if (["ADMIN", "OWNER"].includes(user.role))
          setDashboard(await api("dashboard", undefined, controller.signal));
        if (user.role === "CUSTOMER")
          setAccount(await api("account", undefined, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      } finally {
        running = false;
      }
    }, 20000);
    return () => {
      clearInterval(timer);
      controller.abort();
      if (pollController.current === controller) pollController.current = null;
    };
  }, [user?.id, user?.role]);
  useEffect(() => {
    if (!overlay) return;
    const close = (event) => {
      if (event.key === "Escape") setOverlay(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [overlay]);
  async function run(fn, refreshAfter = true) {
    setError("");
    if (messageTimer.current) {
      clearTimeout(messageTimer.current);
      messageTimer.current = null;
    }
    setMessage("");
    setBusy(true);
    try {
      await fn();
      if (refreshAfter) await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submitAuth(e, action = mode) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const data = await api(action, {
        name: form.get("name"),
        identifier: form.get("identifier"),
        email: form.get("email"),
        phone: form.get("phone"),
        password: form.get("password"),
        passwordConfirmation: form.get("passwordConfirmation"),
        birthDate: form.get("birthDate"),
        consent: form.get("consent") === "on",
      });
      if (action === "register") {
        setOtpFlow({
          purpose: "REGISTRATION",
          challengeId: data.challengeId,
          destination: data.destination,
          resendAt: Date.now() + data.resendAfterSeconds * 1000,
        });
        setMode("registration-otp");
        showTransientMessage(data.message);
        return;
      }
      setUser(data.user);
      setView(
        data.user.role === "CUSTOMER"
          ? "menu"
          : data.user.role === "MANAGER"
            ? "products"
            : "orders",
      );
    }, action !== "register");
  }
  function submitForgotPassword(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const data = await api("password-reset-request", {
        identifier: form.get("identifier"),
      });
      setOtpFlow({
        purpose: "PASSWORD_RESET",
        challengeId: data.challengeId,
        destination: data.destination,
        resendAt: Date.now() + data.resendAfterSeconds * 1000,
      });
      setMode("password-reset-otp");
      showTransientMessage(data.message);
    }, false);
  }
  function submitOtp(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const data = await api("otp-verify", {
        challengeId: otpFlow?.challengeId,
        purpose: otpFlow?.purpose,
        code: form.get("code"),
      });
      if (otpFlow?.purpose === "REGISTRATION") {
        if (data.user) {
          setOtpFlow((current) => ({ ...current, completedUser: data.user }));
          setMode("registration-success");
        } else {
          setOtpFlow(null);
          setMode("login");
          showTransientMessage("Akun sudah aktif. Silakan masuk.");
        }
        return;
      }
      setOtpFlow((current) => ({
        ...current,
        resetToken: data.resetToken,
      }));
      setMode("password-reset-new");
    }, false);
  }
  function submitNewPassword(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const data = await api("password-reset", {
        resetToken: otpFlow?.resetToken,
        password: form.get("password"),
        passwordConfirmation: form.get("passwordConfirmation"),
      });
      setOtpFlow(null);
      setMode("password-reset-success");
      showTransientMessage(data.message);
    }, false);
  }
  function resendCurrentOtp() {
    run(async () => {
      const data = await api("otp-resend", {
        challengeId: otpFlow?.challengeId,
        purpose: otpFlow?.purpose,
      });
      setOtpFlow((current) => ({
        ...current,
        challengeId: data.challengeId,
        destination: data.destination,
        resendAt: Date.now() + data.resendAfterSeconds * 1000,
      }));
      showTransientMessage(data.message);
    }, false);
  }
  async function continueAfterRegistration() {
    setBusy(true);
    setError("");
    try {
      setView("menu");
      await refresh();
      setOtpFlow(null);
      setMode("login");
    } catch (continueError) {
      setError(continueError.message);
    } finally {
      setBusy(false);
    }
  }
  function togglePassword(field) {
    setPasswordVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }
  function showTransientMessage(text, duration = 2500) {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage(text);
    messageTimer.current = setTimeout(() => {
      setMessage((current) => (current === text ? "" : current));
      messageTimer.current = null;
    }, duration);
  }
  const otpResendRemaining = otpFlow
    ? Math.max(0, Math.ceil((otpFlow.resendAt - authClock) / 1000))
    : 0;
  const count = Object.values(cart).reduce((s, n) => s + n, 0),
    total = menu.products.reduce((s, p) => s + p.price * (cart[p.id] || 0), 0);
  const checkoutItems = menu.products
    .filter((product) => cart[product.id] > 0)
    .map((product) => ({ productId: product.id, quantity: cart[product.id] }));
  const checkoutItemsSignature = JSON.stringify(checkoutItems);
  function step(id, n) {
    setCart((old) => ({ ...old, [id]: Math.max(0, (old[id] || 0) + n) }));
  }
  const role = user?.role;
  useEffect(() => {
    if (role !== "ADMIN") return;
    const resetAdminOrderView = () => {
      setAdminOrderFilter("all");
      setAdminOrderSearch("");
    };
    window.addEventListener(
      "warkost:admin-order-filter-reset",
      resetAdminOrderView,
    );
    const openAdminOrderContext = (event) => {
      const orderId = Number(event.detail?.orderId || 0);
      setView("orders");
      setAdminOrderFilter("all");
      setAdminOrderSearch(orderId ? `WB${String(orderId).padStart(6, "0")}` : "");
    };
    window.addEventListener(
      "warkost:open-admin-order-context",
      openAdminOrderContext,
    );
    return () => {
      window.removeEventListener(
        "warkost:admin-order-filter-reset",
        resetAdminOrderView,
      );
      window.removeEventListener(
        "warkost:open-admin-order-context",
        openAdminOrderContext,
      );
    };
  }, [role]);
  const activePromotions = menu.promotions || [];
  const activePromo = activePromotions.length
    ? activePromotions[promoIndex % activePromotions.length]
    : null;
  const filteredMenuProducts = menu.products.filter((product) => {
    const categoryMatches =
      !selectedCategory || product.category_id === selectedCategory;
    const search = productSearch.trim().toLowerCase();
    const searchMatches =
      !search ||
      `${product.name} ${product.description || ""}`
        .toLowerCase()
        .includes(search);
    return categoryMatches && searchMatches;
  });
  const customerVisibleOrders =
    orderFilter === "all"
      ? orders
      : orders.filter((order) => {
          if (orderFilter === "process")
            return !["DELIVERED", "CANCELLED"].includes(order.status);
          if (orderFilter === "completed") return order.status === "DELIVERED";
          if (orderFilter === "cancelled") return order.status === "CANCELLED";
          return true;
        });
  const adminCounts = adminOrderCounts(orders);
  const adminVisibleOrders = filterAdminOrders(
    orders,
    adminOrderFilter,
    adminOrderSearch,
  );
  const visibleOrders =
    role === "CUSTOMER"
      ? customerVisibleOrders
      : role === "ADMIN"
        ? adminVisibleOrders
        : orders;
  const customerOrderCounts = {
    all: orders.length,
    process: orders.filter(
      (order) => !["DELIVERED", "CANCELLED"].includes(order.status),
    ).length,
    completed: orders.filter((order) => order.status === "DELIVERED").length,
    cancelled: orders.filter((order) => order.status === "CANCELLED").length,
  };
  const selectedCheckoutAddress =
    account.addresses.find(
      (address) => String(address.id) === String(checkoutAddressId),
    ) || account.addresses[0];
  const checkoutFinalTotal =
    total -
    Number(voucherQuote?.voucher_discount || 0) -
    Number(loyaltyQuote?.loyalty_discount || 0) +
    (deliveryQuote?.available ? Number(deliveryQuote.delivery_fee || 0) : 0);
  const selectedVoucher = account.vouchers.find(
    (voucher) => Number(voucher.id) === Number(selectedVoucherId),
  );
  const selectedVoucherMinimumOrder = Number(
    selectedVoucher?.minimum_order || 0,
  );
  useEffect(() => {
    if (
      role !== "CUSTOMER" ||
      view !== "cart" ||
      !selectedCheckoutAddress?.id
    ) {
      setDeliveryQuote(null);
      setDeliveryQuoteError("");
      setDeliveryQuoteBusy(false);
      return;
    }
    const controller = new AbortController();
    setDeliveryQuote(null);
    setDeliveryQuoteError("");
    setDeliveryQuoteBusy(true);
    api(
      "delivery/quote",
      { addressId: selectedCheckoutAddress.id },
      controller.signal,
    )
      .then(setDeliveryQuote)
      .catch((error) => {
        if (error.name !== "AbortError") setDeliveryQuoteError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDeliveryQuoteBusy(false);
      });
    return () => controller.abort();
  }, [role, view, selectedCheckoutAddress?.id]);
  useEffect(() => {
    if (role !== "CUSTOMER" || view !== "cart" || !selectedVoucherId) {
      setVoucherQuote(null);
      setVoucherQuoteError("");
      setVoucherQuoteBusy(false);
      return;
    }
    if (selectedRewardId) {
      setVoucherQuote(null);
      setVoucherQuoteError(
        "Voucher tidak dapat digabung dengan Loyalty Reward.",
      );
      setVoucherQuoteBusy(false);
      return;
    }
    if (!checkoutItems.length) {
      setVoucherQuote(null);
      setVoucherQuoteError("Tambahkan produk sebelum memakai voucher.");
      setVoucherQuoteBusy(false);
      return;
    }
    if (!selectedVoucher || selectedVoucher.state !== "CLAIMED") {
      setVoucherQuote(null);
      setVoucherQuoteError("Voucher belum siap digunakan.");
      setVoucherQuoteBusy(false);
      return;
    }
    if (total < selectedVoucherMinimumOrder) {
      setVoucherQuote(null);
      setVoucherQuoteError(
        `Minimum belanja voucher adalah ${money(selectedVoucherMinimumOrder)}`,
      );
      setVoucherQuoteBusy(false);
      return;
    }
    const controller = new AbortController();
    setVoucherQuote(null);
    setVoucherQuoteError("");
    setVoucherQuoteBusy(true);
    api(
      "voucher-quote",
      { promotionId: selectedVoucherId, items: checkoutItems },
      controller.signal,
    )
      .then(setVoucherQuote)
      .catch((quoteError) => {
        if (quoteError.name !== "AbortError")
          setVoucherQuoteError(quoteError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoucherQuoteBusy(false);
      });
    return () => controller.abort();
  }, [
    role,
    view,
    selectedVoucherId,
    selectedRewardId,
    selectedVoucher?.state,
    selectedVoucherMinimumOrder,
    checkoutItems.length,
    checkoutItemsSignature,
    total,
  ]);
  useEffect(() => {
    if (role !== "CUSTOMER" || view !== "cart" || !selectedRewardId) {
      setLoyaltyQuote(null);
      setLoyaltyQuoteError("");
      setLoyaltyQuoteBusy(false);
      return;
    }
    const controller = new AbortController();
    setLoyaltyQuote(null);
    setLoyaltyQuoteError("");
    setLoyaltyQuoteBusy(true);
    api(
      "loyalty-quote",
      { rewardRuleId: selectedRewardId, items: checkoutItems },
      controller.signal,
    )
      .then(setLoyaltyQuote)
      .catch((quoteError) => {
        if (quoteError.name !== "AbortError")
          setLoyaltyQuoteError(quoteError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoyaltyQuoteBusy(false);
      });
    return () => controller.abort();
  }, [role, view, selectedRewardId, checkoutItemsSignature]);
  const focusedOrder = orders.find(
    (order) => order.id === (focusedOrderId || lastCreatedOrderId),
  );
  const activeCustomerOrder = orders.find(
    (order) => !["DELIVERED", "CANCELLED"].includes(order.status),
  );
  const supportOrder =
    orders.find((order) => String(order.id) === String(supportOrderId)) ||
    activeCustomerOrder;
  const supportDriverAssigned = Boolean(supportOrder?.driver_id);
  const supportDriverContactEnabled = Boolean(
    supportDriverAssigned &&
    ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(supportOrder.status),
  );
  const filteredNotifications = alerts.notifications.filter(
    (notification) =>
      notificationFilter === "all" ||
      notificationCategory(notification.message) === notificationFilter,
  );
  const customerBatchView =
    role === "CUSTOMER" &&
    ["cart", "orders", "order-success", "notifications"].includes(view);
  function goToCustomerOrders(filter = "all") {
    setOrderFilter(
      filter === "tracking"
        ? "process"
        : filter === "history"
          ? "completed"
          : filter,
    );
    setOverlay(null);
    setView("orders");
  }
  function openCustomerTracking(orderId) {
    setFocusedOrderId(orderId);
    setOverlay(null);
    setView("order-success");
  }
  function openAccountSection(sectionId) {
    setOverlay(null);
    setView("account");
    requestAnimationFrame(() =>
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: "smooth" }),
    );
  }
  function openCustomerSupport(orderId = null, topic = null) {
    if (orderId && ["admin", "chat-admin"].includes(topic)) {
      setOverlay(null);
      setChatTarget({ type: "CUSTOMER_ADMIN", orderId });
      return;
    }
    if (orderId && ["driver", "delivery", "chat-driver"].includes(topic)) {
      setOverlay(null);
      setChatTarget({ type: "CUSTOMER_DRIVER", orderId });
      return;
    }
    setSupportOrderId(orderId);
    setSupportTopic(topic);
    setOverlay("support");
  }
  function reorderItems(items) {
    const additions = {};
    for (const item of items || []) {
      const product = menu.products.find(
        (candidate) => candidate.name === item.name,
      );
      if (product)
        additions[product.id] = (additions[product.id] || 0) + item.quantity;
    }
    if (!Object.keys(additions).length) {
      setError("Menu dari pesanan ini sudah tidak tersedia.");
      return;
    }
    setCart((current) => {
      const next = { ...current };
      for (const [id, quantity] of Object.entries(additions))
        next[id] = (next[id] || 0) + quantity;
      return next;
    });
    setView("menu");
    setMessage("Menu dari pesanan sebelumnya sudah ditambahkan ke keranjang.");
  }
  function logout() {
    setOverlay(null);
    run(async () => {
      pollController.current?.abort();
      refreshController.current?.abort();
      await api("logout", {});
      setUser(null);
      setView("menu");
    });
  }
  function useDeviceLocation(event) {
    const form = event.currentTarget.form;
    const latitudeField =
      event.currentTarget.dataset.latitudeField || "latitude";
    const longitudeField =
      event.currentTarget.dataset.longitudeField || "longitude";
    const latitudeInput = form?.elements.namedItem(latitudeField);
    const longitudeInput = form?.elements.namedItem(longitudeField);
    if (!latitudeInput || !longitudeInput) {
      setError("Form titik lokasi tidak tersedia");
      return;
    }
    if (!navigator.geolocation) {
      setError("Lokasi perangkat tidak didukung browser ini");
      return;
    }
    setError("");
    setMessage("Meminta izin lokasi perangkat…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        latitudeInput.value = coords.latitude.toFixed(6);
        longitudeInput.value = coords.longitude.toFixed(6);
        setMessage("Titik lokasi berhasil diisi");
      },
      () => {
        setMessage("");
        setError(
          "Lokasi belum dapat diambil. Izinkan akses lokasi lalu coba lagi.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  async function saveQuickAddress(event) {
    const form = event.currentTarget.form;
    if (!form || quickAddressAttempt.current) return;
    const fields = form.elements;
    const label = String(
      fields.namedItem("quickAddressLabel")?.value || "",
    ).trim();
    const detail = String(
      fields.namedItem("quickAddressDetail")?.value || "",
    ).trim();
    if (label.length < 2 || detail.length < 10) {
      setError("Lengkapi label dan alamat pengantaran dengan benar.");
      return;
    }
    quickAddressAttempt.current = true;
    setQuickAddressBusy(true);
    setError("");
    try {
      const created = await api("address", {
        label,
        detail,
        latitude: fields.namedItem("quickAddressLatitude")?.value,
        longitude: fields.namedItem("quickAddressLongitude")?.value,
        isDefault: false,
      });
      const refreshedAccount = await api("account");
      setAccount(refreshedAccount);
      setCheckoutAddressId(String(created.id));
      setDeliveryQuote(null);
      setDeliveryQuoteError("");
      setQuickAddressOpen(false);
      showTransientMessage("Alamat berhasil ditambahkan.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      quickAddressAttempt.current = false;
      setQuickAddressBusy(false);
    }
  }
  function openCustomerHelp() {
    openCustomerSupport(null);
  }
  return (
    <>
      <header
        className={`top ${
          role === "CUSTOMER" ? "customer-home-header customer-app-header" : ""
        } ${!role ? "guest-customer-header" : ""} ${
          !role && view === "auth" ? "auth-header" : ""
        }`}
      >
        <button
          className="brand brand-button"
          type="button"
          aria-label="Buka menu utama"
          onClick={() => {
            if (!role || role === "CUSTOMER") {
              setOverlay(null);
              setView("menu");
            }
          }}
        >
          <Image
            className="brand-logo"
            src="/warkost-bahagia-logo-clean.png"
            alt="Warkost Bahagia"
            width={1672}
            height={941}
            priority
          />
          <span className="brand-copy">
            <strong>{menu.brand}</strong>
            <small>Pesanan hangat, sampai dengan aman.</small>
          </span>
        </button>
        <nav
          className={role === "CUSTOMER" ? "customer-desktop-nav" : ""}
          aria-label={
            role === "CUSTOMER" ? "Navigasi pelanggan utama" : undefined
          }
        >
          {role === "CUSTOMER" ? (
            <>
              <button
                className={`home-nav-item ${overlay === "notifications" ? "active" : ""}`}
                aria-label="Buka notifikasi"
                onClick={() => setOverlay("notifications")}
              >
                <span className="home-nav-icon">
                  <BellIcon />
                  {alerts.unread > 0 && <span className="nav-alert-dot" />}
                </span>
                <span className="nav-label">Notifikasi</span>
              </button>
              <button
                className={`home-nav-item ${overlay === "cart" || view === "cart" ? "active" : ""}`}
                aria-label="Keranjang"
                onClick={() => setOverlay("cart")}
              >
                <span className="home-nav-icon">
                  <CartIcon />
                  {count > 0 && (
                    <span className="home-cart-count">{count}</span>
                  )}
                </span>
                <span className="nav-label">Keranjang</span>
              </button>
              <button
                className={`home-nav-item ${overlay === "account" || view === "account" ? "active" : ""}`}
                aria-label="Akun"
                onClick={() => setOverlay("account")}
              >
                <span className="home-nav-icon">
                  <UserIcon />
                </span>
                <span className="nav-label">Akun</span>
              </button>
              <button
                className="home-nav-item"
                aria-label="Bantuan"
                onClick={openCustomerHelp}
              >
                <span className="home-nav-icon">
                  <HelpIcon />
                </span>
                <span className="nav-label">Bantuan</span>
              </button>
            </>
          ) : role ? (
            <>
              <button
                data-admin-nav={role === "ADMIN" ? "Operasional" : undefined}
                className={
                  role === "ADMIN" && view === "orders"
                    ? "admin-nav-active"
                    : undefined
                }
                onClick={() =>
                  setView(role === "MANAGER" ? "products" : "orders")
                }
              >
                {role === "ADMIN" && <AdminNavIcon name="home" />}
                {role === "ADMIN"
                  ? "Operasional"
                  : role === "MANAGER"
                    ? "Kelola menu"
                    : role === "KITCHEN"
                      ? "Dapur"
                      : role === "OWNER"
                        ? "Dashboard"
                        : "Tugas saya"}
              </button>
              {role === "ADMIN" && (
                <>
                  <button
                    data-admin-nav="Pelanggan"
                    className={
                      view === "customers" ? "admin-nav-active" : undefined
                    }
                    onClick={() => setView("customers")}
                  >
                    <AdminNavIcon name="users" />
                    Pelanggan
                  </button>
                  <button
                    data-admin-nav="Stok"
                    className={
                      view === "admin-stock" ? "admin-nav-active" : undefined
                    }
                    onClick={() => setView("admin-stock")}
                  >
                    <AdminNavIcon name="box" />
                    Stok
                  </button>
                  <button
                    data-admin-nav="Printer"
                    className={
                      view === "printing" ? "admin-nav-active" : undefined
                    }
                    onClick={() => setView("printing")}
                  >
                    <AdminNavIcon name="printer" />
                    Printer
                  </button>
                </>
              )}
              {role === "MANAGER" && (
                <>
                  <button onClick={() => setView("products")}>Produk</button>
                  <button onClick={() => setView("promotions")}>Promo</button>
                  <button onClick={() => setView("stock")}>Stok</button>
                </>
              )}
              {role === "OWNER" && (
                <>
                  <button onClick={() => setView("customers")}>
                    Pelanggan
                  </button>
                  <button onClick={() => setView("products")}>Produk</button>
                  <button onClick={() => setView("promotions")}>Promo</button>
                  <button onClick={() => setView("settings")}>
                    Pengaturan
                  </button>
                  <button onClick={() => setView("loyalty-rules")}>
                    Loyalty
                  </button>
                  <button onClick={() => setView("stock")}>Stok</button>
                  <button onClick={() => setView("staff")}>Staf</button>
                  <button onClick={() => setView("audit")}>Audit log</button>
                  <button onClick={() => setView("printing")}>Printer</button>
                  <button
                    onClick={async () => {
                      setView("reports");
                      try {
                        setReport(await api("report"));
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Laporan
                  </button>
                </>
              )}
              {role === "KITCHEN" && (
                <button onClick={() => setView("printing")}>Printer</button>
              )}
            </>
          ) : null}
          {role && role !== "CUSTOMER" && (
            <button
              data-admin-nav={role === "ADMIN" ? "Notifikasi" : undefined}
              className="icon-nav-button"
              aria-label="Buka notifikasi"
              onClick={() => {
                if (role === "CUSTOMER") setOverlay("notifications");
                else if (role !== "ADMIN") setView("notifications");
              }}
            >
              <BellIcon />
              <span>Notifikasi</span>
              {alerts.unread > 0 && (
                <span className="notification-count">{alerts.unread}</span>
              )}
            </button>
          )}
          {role && role !== "CUSTOMER" ? (
            <button
              data-admin-nav={role === "ADMIN" ? "Keluar" : undefined}
              onClick={logout}
            >
              {role === "ADMIN" && <AdminNavIcon name="logout" />}
              Keluar
            </button>
          ) : !role ? (
            <>
              {view === "auth" && (
                <>
                  <button
                    onClick={() => {
                      setView("menu");
                      requestAnimationFrame(() =>
                        document
                          .getElementById("menu-grid")
                          ?.scrollIntoView({ behavior: "smooth" }),
                      );
                    }}
                  >
                    Menu
                  </button>
                  <button
                    onClick={() => {
                      setView("menu");
                      requestAnimationFrame(() =>
                        document
                          .getElementById("customer-help")
                          ?.scrollIntoView({ behavior: "smooth" }),
                      );
                    }}
                  >
                    Bantuan
                  </button>
                </>
              )}
              <button
                className="guest-login-nav"
                onClick={() => {
                  setMode("login");
                  setView("auth");
                }}
              >
                Masuk
              </button>
            </>
          ) : null}
        </nav>
      </header>
      <main
        data-admin-view={role === "ADMIN" ? view : undefined}
        className={[
          role === "CUSTOMER" ? "customer-app-main" : "",
          (!role || role === "CUSTOMER") && view === "menu"
            ? "customer-home-main"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!((!role || role === "CUSTOMER") && view === "menu") &&
          !customerBatchView && (
            <div className="heading">
              <div>
                <span className="eyebrow">
                  {role === "ADMIN"
                    ? view === "customers"
                      ? "PUSAT PELANGGAN"
                      : view === "admin-stock"
                        ? "PUSAT STOK ADMIN"
                        : view === "printing"
                          ? "PUSAT PRINTER"
                          : "PUSAT OPERASIONAL"
                    : role === "MANAGER"
                      ? "MANAJEMEN KOMERSIAL"
                      : role === "KITCHEN"
                        ? "STASIUN DAPUR"
                        : role === "OWNER"
                          ? "KONTROL OWNER"
                          : role === "DRIVER"
                            ? "PENGANTARAN"
                            : "DAPUR WARKOST"}
                </span>
                <h1>
                  {view === "notifications"
                    ? "Notifikasi"
                    : view === "admin-stock" && role === "ADMIN"
                      ? "Stok Minuman"
                      : view === "promotions" &&
                          ["MANAGER", "OWNER"].includes(role)
                        ? "Kelola promo"
                        : view === "customers" &&
                            ["ADMIN", "OWNER"].includes(role)
                          ? "Kelola pelanggan"
                          : view === "reports" && role === "OWNER"
                            ? "Laporan harian"
                            : view === "stock" &&
                                ["MANAGER", "OWNER"].includes(role)
                              ? "Kontrol stok"
                              : view === "staff" && role === "OWNER"
                                ? "Kelola staf"
                                : view === "audit" && role === "OWNER"
                                  ? "Audit aktivitas"
                                  : view === "loyalty-rules" && role === "OWNER"
                                    ? "Aturan Loyalty Reward"
                                    : role === "KITCHEN"
                                      ? "Antrean makanan"
                                      : role === "OWNER"
                                        ? "Ringkasan usaha"
                                        : role === "ADMIN"
                                          ? "Pantau pesanan hari ini"
                                          : role === "MANAGER"
                                            ? "Kelola operasional komersial"
                                            : role === "DRIVER"
                                              ? "Tugas pengantaran"
                                              : view === "menu"
                                                ? "Mau makan apa hari ini?"
                                                : view === "orders"
                                                  ? "Pesanan saya"
                                                  : view === "account"
                                                    ? "Akun saya"
                                                    : "Selamat datang"}
                </h1>
              </div>
              {role === "CUSTOMER" && view === "menu" && (
                <button
                  className="primary heading-cart-button"
                  onClick={() => setOverlay("cart")}
                >
                  Keranjang · {count} · {money(total)}
                </button>
              )}
            </div>
          )}
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="success">
            {message}
          </div>
        )}
        {!role && view === "auth" ? (
          <section
            className="auth-onboarding"
            aria-label="Onboarding pelanggan Warkost"
          >
            {["login", "register"].includes(mode) ? (
              <div
                className="auth-mobile-switch"
                aria-label="Pilih formulir akun"
              >
                <button
                  className={mode === "login" ? "active" : ""}
                  type="button"
                  onClick={() => setMode("login")}
                >
                  Masuk
                </button>
                <button
                  className={mode === "register" ? "active" : ""}
                  type="button"
                  onClick={() => setMode("register")}
                >
                  Daftar
                </button>
              </div>
            ) : (
              <div className="auth-flow-back">
                <button
                  type="button"
                  onClick={() => {
                    setOtpFlow(null);
                    setMode("login");
                  }}
                >
                  ← Kembali ke Masuk
                </button>
              </div>
            )}

            <article className="auth-story-card">
              <div className="auth-story-copy">
                <span className="auth-story-badge">WARKOST BAHAGIA</span>
                <h1>Makan Enak Lebih Mudah di Warkost Bahagia</h1>
                <p>
                  Pilih menu favorit, nikmati promo, dan tunggu pesanan hangat
                  sampai di tujuan.
                </p>
                <ul className="auth-benefits">
                  <li>
                    <BowlIcon />
                    <span>
                      <strong>Pesan Makanan Favorit</strong>
                      <small>Menu hangat dari dapur Warkost</small>
                    </span>
                  </li>
                  <li>
                    <TicketIcon />
                    <span>
                      <strong>Banyak Promo &amp; Loyalty</strong>
                      <small>Lebih hemat di setiap pesanan</small>
                    </span>
                  </li>
                  <li>
                    <TruckIcon />
                    <span>
                      <strong>Diantar Sampai Tujuan</strong>
                      <small>Pengantaran aman dan terpantau</small>
                    </span>
                  </li>
                </ul>
              </div>
              <div className="auth-story-visual">
                <Image
                  src="/demo/promo-warkost.webp"
                  alt="Menu makanan dan minuman Warkost Bahagia"
                  fill
                  sizes="(max-width: 760px) 100vw, 34vw"
                  priority
                />
                <span>Hangat · Lezat · Bahagia</span>
              </div>
            </article>

            <article
              className={`auth-card auth-login-card ${mode === "login" ? "active" : ""}`}
            >
              <div className="auth-card-heading">
                <Image
                  className="auth-card-logo"
                  src="/warkost-bahagia-logo-clean.png"
                  alt="Warkost Bahagia"
                  width={1672}
                  height={941}
                />
                <span className="auth-card-kicker">SELAMAT DATANG KEMBALI</span>
                <h2>Masuk ke Akun</h2>
                <p>Masuk untuk melanjutkan pesanan dan melihat loyalty.</p>
              </div>
              <form onSubmit={(event) => submitAuth(event, "login")}>
                <label>
                  Email atau Nomor HP
                  <input
                    name="identifier"
                    required
                    autoComplete="username"
                    placeholder="customer@warkost.local"
                  />
                </label>
                <label>
                  Password
                  <span className="password-field">
                    <input
                      name="password"
                      type={passwordVisibility.login ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      placeholder="Masukkan password"
                    />
                    <button
                      type="button"
                      aria-label={
                        passwordVisibility.login
                          ? "Sembunyikan password"
                          : "Tampilkan password"
                      }
                      onClick={() => togglePassword("login")}
                    >
                      {passwordVisibility.login ? "Sembunyikan" : "Lihat"}
                    </button>
                  </span>
                </label>
                <div className="auth-form-meta">
                  <span>Sesi aman hingga 7 hari</span>
                  <button
                    type="button"
                    onClick={() => setMode("password-reset-request")}
                  >
                    Lupa password?
                  </button>
                </div>
                <button className="primary auth-submit" disabled={busy}>
                  {busy ? "Memproses…" : "Masuk"}
                </button>
                <button
                  className="auth-secondary"
                  type="button"
                  onClick={() => setMode("register")}
                >
                  Belum punya akun? Daftar Akun
                </button>
              </form>
            </article>

            <article
              className={`auth-card auth-register-card ${mode === "register" ? "active" : ""}`}
            >
              <div className="auth-card-heading compact">
                <Image
                  className="auth-card-logo"
                  src="/warkost-bahagia-logo-clean.png"
                  alt="Warkost Bahagia"
                  width={1672}
                  height={941}
                />
                <span className="auth-card-kicker">MULAI PESAN DI WARKOST</span>
                <h2>Daftar Akun</h2>
                <p>Lengkapi data berikut untuk membuat akun pelanggan.</p>
              </div>
              <form onSubmit={(event) => submitAuth(event, "register")}>
                <div className="auth-field-grid">
                  <label>
                    Nama Lengkap
                    <input
                      name="name"
                      required
                      minLength="2"
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Nomor HP
                    <input
                      name="phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      placeholder="08xxxxxxxxxx"
                    />
                  </label>
                  <label>
                    Tanggal Lahir
                    <input
                      name="birthDate"
                      type="date"
                      required
                      max="2099-12-31"
                    />
                  </label>
                </div>
                <label>
                  Password
                  <span className="password-field">
                    <input
                      name="password"
                      type={passwordVisibility.register ? "text" : "password"}
                      required
                      minLength="10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword("register")}
                    >
                      {passwordVisibility.register ? "Sembunyikan" : "Lihat"}
                    </button>
                  </span>
                </label>
                <label>
                  Konfirmasi Password
                  <span className="password-field">
                    <input
                      name="passwordConfirmation"
                      type={
                        passwordVisibility.confirmation ? "text" : "password"
                      }
                      required
                      minLength="10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword("confirmation")}
                    >
                      {passwordVisibility.confirmation
                        ? "Sembunyikan"
                        : "Lihat"}
                    </button>
                  </span>
                </label>
                <label className="consent-field auth-consent">
                  <input name="consent" type="checkbox" required />
                  <span>
                    Saya menyetujui Syarat &amp; Ketentuan dan Kebijakan
                    Privasi.
                  </span>
                </label>
                <p className="auth-note">
                  Setelah mendaftar, kode OTP akan dikirim ke email untuk
                  mengaktifkan akun.
                </p>
                <button className="primary auth-submit" disabled={busy}>
                  {busy ? "Memproses…" : "Daftar Akun"}
                </button>
                <button
                  className="auth-secondary"
                  type="button"
                  onClick={() => setMode("login")}
                >
                  Sudah punya akun? Masuk
                </button>
              </form>
            </article>

            <article
              className={`auth-card auth-recovery-card ${mode === "password-reset-request" ? "active" : ""}`}
            >
              <div className="auth-card-heading compact">
                <Image
                  className="auth-card-logo"
                  src="/warkost-bahagia-logo-clean.png"
                  alt="Warkost Bahagia"
                  width={1672}
                  height={941}
                />
                <span className="auth-card-kicker">PEMULIHAN AKUN</span>
                <h2>Lupa Password</h2>
                <p>Masukkan email atau nomor HP akun Warkost Anda.</p>
              </div>
              <form onSubmit={submitForgotPassword}>
                <label>
                  Email atau Nomor HP
                  <input
                    name="identifier"
                    required
                    autoComplete="username"
                    placeholder="Email atau nomor HP"
                  />
                </label>
                <p className="auth-note">
                  Jika akun ditemukan, kode akan dikirim ke email yang
                  terdaftar.
                </p>
                <button className="primary auth-submit" disabled={busy}>
                  {busy ? "Mengirim…" : "Kirim Kode OTP"}
                </button>
                <button
                  className="auth-secondary"
                  type="button"
                  onClick={() => setMode("login")}
                >
                  Kembali ke Masuk
                </button>
              </form>
            </article>

            <article
              className={`auth-card auth-otp-card ${["registration-otp", "password-reset-otp"].includes(mode) ? "active" : ""}`}
            >
              <div className="auth-card-heading compact">
                <Image
                  className="auth-card-logo"
                  src="/warkost-bahagia-logo-clean.png"
                  alt="Warkost Bahagia"
                  width={1672}
                  height={941}
                />
                <span className="auth-card-kicker">VERIFIKASI EMAIL</span>
                <h2>Masukkan Kode OTP</h2>
                <p>
                  Kode 6 digit telah dikirim ke{" "}
                  {otpFlow?.destination || "email Anda"}.
                </p>
              </div>
              <form onSubmit={submitOtp}>
                <label>
                  Kode OTP
                  <input
                    className="otp-code-input"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength="6"
                    maxLength="6"
                    required
                    autoFocus
                    placeholder="000000"
                  />
                </label>
                <p className="auth-note">
                  Kode berlaku 10 menit dan maksimal 5 percobaan.
                </p>
                <button className="primary auth-submit" disabled={busy}>
                  {busy ? "Memverifikasi…" : "Verifikasi Kode"}
                </button>
                <button
                  className="auth-secondary"
                  type="button"
                  disabled={busy || otpResendRemaining > 0}
                  onClick={resendCurrentOtp}
                >
                  {otpResendRemaining > 0
                    ? `Kirim ulang dalam ${otpResendRemaining} detik`
                    : "Kirim Ulang Kode"}
                </button>
              </form>
            </article>

            <article
              className={`auth-card auth-reset-card ${mode === "password-reset-new" ? "active" : ""}`}
            >
              <div className="auth-card-heading compact">
                <Image
                  className="auth-card-logo"
                  src="/warkost-bahagia-logo-clean.png"
                  alt="Warkost Bahagia"
                  width={1672}
                  height={941}
                />
                <span className="auth-card-kicker">PASSWORD BARU</span>
                <h2>Atur Ulang Password</h2>
                <p>Gunakan password baru yang aman, minimal 10 karakter.</p>
              </div>
              <form onSubmit={submitNewPassword}>
                <label>
                  Password Baru
                  <span className="password-field">
                    <input
                      name="password"
                      type={passwordVisibility.reset ? "text" : "password"}
                      required
                      minLength="10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword("reset")}
                    >
                      {passwordVisibility.reset ? "Sembunyikan" : "Lihat"}
                    </button>
                  </span>
                </label>
                <label>
                  Konfirmasi Password Baru
                  <span className="password-field">
                    <input
                      name="passwordConfirmation"
                      type={
                        passwordVisibility.resetConfirmation
                          ? "text"
                          : "password"
                      }
                      required
                      minLength="10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword("resetConfirmation")}
                    >
                      {passwordVisibility.resetConfirmation
                        ? "Sembunyikan"
                        : "Lihat"}
                    </button>
                  </span>
                </label>
                <button className="primary auth-submit" disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan Password Baru"}
                </button>
              </form>
            </article>

            <article
              className={`auth-card auth-success-card ${["registration-success", "password-reset-success"].includes(mode) ? "active" : ""}`}
            >
              <div className="auth-card-heading">
                <Image
                  className="auth-card-logo"
                  src="/warkost-bahagia-logo-clean.png"
                  alt="Warkost Bahagia"
                  width={1672}
                  height={941}
                />
                <span className="auth-success-mark" aria-hidden="true">
                  ✓
                </span>
                <span className="auth-card-kicker">BERHASIL</span>
                <h2>
                  {mode === "registration-success"
                    ? "Akun Sudah Aktif"
                    : "Password Diperbarui"}
                </h2>
                <p>
                  {mode === "registration-success"
                    ? "Email telah terverifikasi. Anda dapat mulai memesan."
                    : "Silakan masuk kembali menggunakan password baru."}
                </p>
              </div>
              <div className="auth-success-actions">
                {mode === "registration-success" ? (
                  <button
                    className="primary auth-submit"
                    type="button"
                    disabled={busy}
                    onClick={continueAfterRegistration}
                  >
                    {busy ? "Memuat…" : "Mulai Pesan"}
                  </button>
                ) : (
                  <button
                    className="primary auth-submit"
                    type="button"
                    onClick={() => setMode("login")}
                  >
                    Kembali ke Masuk
                  </button>
                )}
              </div>
            </article>
          </section>
        ) : null}
        {(!role || role === "CUSTOMER") && view === "menu" && (
          <>
            <section
              className={`customer-hero ${activePromo ? "" : "no-promo"}`}
            >
              <div className="customer-hero-copy">
                <span className="eyebrow">DAPUR WARKOST</span>
                <h1>Mau makan apa hari ini?</h1>
                <p className="hero-lead">Lebih hemat, tetap nikmat.</p>
                <div className="hero-benefits" aria-label="Keunggulan layanan">
                  <span>
                    <TruckIcon />
                    <strong>
                      Gratis Ongkir
                      <br />5 KM
                    </strong>
                  </span>
                  <span>
                    <FoodIcon />
                    <strong>
                      Menu Lezat
                      <br />
                      dan Fresh
                    </strong>
                  </span>
                  <span>
                    <ShieldIcon />
                    <strong>
                      Pesanan Aman
                      <br />
                      dan Terpercaya
                    </strong>
                  </span>
                </div>
              </div>
              {activePromo && (
                <section
                  className="promo-section home-promo"
                  aria-label="Promo berlangsung"
                >
                  <article className="promo-card" key={activePromo.id}>
                    <div className="promo-copy">
                      <span className="promo-badge">{activePromo.badge}</span>
                      <h2>{activePromo.title}</h2>
                      <p>{activePromo.description}</p>
                      <small className="promo-period">
                        {promoDate(activePromo.starts_at)} –{" "}
                        {promoDate(activePromo.ends_at)}
                      </small>
                      <small className="promo-terms">{activePromo.terms}</small>
                      <button
                        className="primary"
                        onClick={() =>
                          document
                            .getElementById("menu-grid")
                            ?.scrollIntoView({ behavior: "smooth" })
                        }
                      >
                        {activePromo.cta_label}
                        <ArrowIcon />
                      </button>
                    </div>
                    <div className="promo-media">
                      {activePromo.image_url ? (
                        <Image
                          className="promo-image"
                          src={activePromo.image_url}
                          alt={`Visual ${activePromo.title}`}
                          fill
                          sizes="(max-width: 620px) 58vw, 43vw"
                          unoptimized
                        />
                      ) : (
                        <Image
                          className="promo-image"
                          src="/demo/promo-warkost.webp"
                          alt="Nasi goreng, mie ayam, dan kopi susu Warkost"
                          fill
                          sizes="(max-width: 620px) 58vw, 43vw"
                          priority
                        />
                      )}
                      <div
                        className="promo-controls"
                        aria-label="Kontrol promo"
                      >
                        {activePromotions.length > 1 && (
                          <button
                            aria-label="Promo sebelumnya"
                            onClick={() =>
                              setPromoIndex(
                                (promoIndex - 1 + activePromotions.length) %
                                  activePromotions.length,
                              )
                            }
                          >
                            ←
                          </button>
                        )}
                        <span className="promo-dots">
                          {activePromotions.map((promo, index) => (
                            <button
                              key={promo.id}
                              aria-label={`Tampilkan promo ${index + 1}`}
                              className={index === promoIndex ? "active" : ""}
                              onClick={() => setPromoIndex(index)}
                            />
                          ))}
                        </span>
                        {activePromotions.length > 1 && (
                          <button
                            aria-label="Promo berikutnya"
                            onClick={() =>
                              setPromoIndex(
                                (promoIndex + 1) % activePromotions.length,
                              )
                            }
                          >
                            →
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                </section>
              )}
            </section>
            <section className="customer-catalog" aria-labelledby="menu-title">
              <div className="catalog-tools">
                <label className="menu-search">
                  <SearchIcon />
                  <span className="sr-only">Cari makanan atau minuman</span>
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Cari makanan atau minuman..."
                  />
                </label>
                <div className="filters" aria-label="Kategori menu">
                  <button
                    className={!selectedCategory ? "active" : ""}
                    onClick={() => setSelectedCategory(0)}
                  >
                    <FoodIcon />
                    Semua
                  </button>
                  {menu.categories.map((category) => (
                    <button
                      key={category.id}
                      className={
                        selectedCategory === category.id ? "active" : ""
                      }
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      {category.name.toLowerCase().includes("minum") ? (
                        <DrinkIcon />
                      ) : (
                        <BowlIcon />
                      )}
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="catalog-heading">
                <div>
                  <h2 id="menu-title">Menu Pilihan</h2>
                  <p>Menu favorit yang paling banyak dipesan.</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedCategory(0);
                    setProductSearch("");
                  }}
                >
                  Lihat Semua
                  <ArrowIcon />
                </button>
              </div>
              <div className="grid customer-products" id="menu-grid">
                {filteredMenuProducts.map((p, index) => {
                  const badge = demoProductBadges[index];
                  return (
                    <article className="product customer-product" key={p.id}>
                      <div className="food-visual">
                        <Image
                          src={p.image_url || demoProductImage(p.name)}
                          alt={p.name}
                          fill
                          sizes="(max-width: 620px) 50vw, (max-width: 850px) 50vw, 33vw"
                          unoptimized={Boolean(p.image_url)}
                        />
                        {badge && (
                          <span className={`product-badge ${badge[2]}`}>
                            <b>{badge[0]}</b> {badge[1]}
                          </span>
                        )}
                      </div>
                      <div className="product-body">
                        <small>
                          {
                            menu.categories.find((c) => c.id === p.category_id)
                              ?.name
                          }
                        </small>
                        <h2>{p.name}</h2>
                        <p>{p.description}</p>
                        <div className="product-foot">
                          <strong>{money(p.price)}</strong>
                          {role === "CUSTOMER" ? (
                            <div
                              className={`qty ${cart[p.id] ? "" : "is-empty"}`}
                            >
                              <button
                                onClick={() => step(p.id, -1)}
                                aria-label={"Kurangi " + p.name}
                              >
                                −
                              </button>
                              <span>{cart[p.id] || 0}</span>
                              <button
                                onClick={() => step(p.id, 1)}
                                aria-label={"Tambah " + p.name}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              className="guest-product-cta"
                              onClick={() => {
                                setMode("login");
                                setView("auth");
                              }}
                            >
                              Pesan
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!filteredMenuProducts.length && (
                <div className="menu-empty">
                  <p>Menu yang kamu cari belum tersedia.</p>
                  <button
                    onClick={() => {
                      setSelectedCategory(0);
                      setProductSearch("");
                    }}
                  >
                    Tampilkan semua menu
                  </button>
                </div>
              )}
            </section>
            {(!role || role === "CUSTOMER") && (
              <section className="customer-help" id="customer-help">
                <span className="help-illustration">
                  <HelpIcon />
                </span>
                <div>
                  <h2>Butuh bantuan?</h2>
                  <p>
                    Kami siap membantu pesanan, pembayaran, atau pertanyaan
                    lainnya.
                  </p>
                </div>
                <div className="help-actions">
                  <a
                    href={whatsappLink(
                      settings.businessWhatsApp,
                      "Halo Warkost Bahagia, saya butuh bantuan.",
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ChatIcon />
                    Chat
                  </a>
                  <a
                    href={`tel:+${String(settings.businessWhatsApp).replace(/\D/g, "")}`}
                  >
                    <PhoneIcon />
                    Telepon
                  </a>
                </div>
              </section>
            )}
          </>
        )}
        {role === "CUSTOMER" && view === "cart" && (
          <section
            className="customer-checkout"
            aria-labelledby="checkout-title"
          >
            <div className="customer-page-title checkout-title-block">
              <button
                className="back-link"
                type="button"
                onClick={() => setView("menu")}
              >
                <ArrowIcon /> Kembali ke menu
              </button>
              <h1 id="checkout-title">Checkout Pesanan</h1>
              <p>
                Lengkapi detail pesananmu. Total akhir dan ongkir tetap dihitung
                aman oleh server.
              </p>
            </div>
            {!count ? (
              <div className="panel empty-state checkout-empty">
                <CartIcon />
                <h2>Keranjangmu masih kosong</h2>
                <p>Pilih menu favoritmu terlebih dahulu.</p>
                <button className="primary" onClick={() => setView("menu")}>
                  Pilih Menu
                </button>
              </div>
            ) : (
              <form
                className="checkout-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!deliveryQuote?.available) {
                    setError(
                      deliveryQuote?.message ||
                        deliveryQuoteError ||
                        "Ongkir belum dapat diverifikasi.",
                    );
                    return;
                  }
                  const f = new FormData(e.currentTarget);
                  run(async () => {
                    const payload = {
                      addressId: Number(f.get("address")),
                      method: f.get("method"),
                      promotionId: selectedVoucherId,
                      loyaltyRewardId: selectedRewardId,
                      items: checkoutItems,
                    };
                    const signature = JSON.stringify(payload);
                    if (checkoutAttempt.current?.signature !== signature)
                      checkoutAttempt.current = {
                        signature,
                        key: crypto.randomUUID(),
                      };
                    const result = await api("checkout", {
                      ...payload,
                      idempotencyKey: checkoutAttempt.current.key,
                    });
                    checkoutAttempt.current = null;
                    setLastCreatedOrderId(result.id);
                    setFocusedOrderId(result.id);
                    setCart({});
                    setSelectedVoucherId(null);
                    setVoucherQuote(null);
                    setSelectedRewardId(null);
                    setLoyaltyQuote(null);
                    setView("order-success");
                  });
                }}
              >
                <div className="checkout-stack">
                  <section className="checkout-card cart-checkout-card">
                    <div className="checkout-card-heading">
                      <span className="section-icon">
                        <CartIcon />
                      </span>
                      <h2>Keranjang Anda</h2>
                      <button
                        className="outline-action"
                        type="button"
                        onClick={() => setView("menu")}
                      >
                        + Tambah Menu
                      </button>
                    </div>
                    <div className="checkout-items">
                      {menu.products
                        .filter((p) => cart[p.id] > 0)
                        .map((p) => (
                          <div className="checkout-item" key={p.id}>
                            <Image
                              src={p.image_url || demoProductImage(p.name)}
                              alt=""
                              width={86}
                              height={68}
                              unoptimized={Boolean(p.image_url)}
                            />
                            <span className="checkout-item-copy">
                              <strong>{p.name}</strong>
                              <small>
                                {cart[p.id]} × {money(p.price)}
                              </small>
                            </span>
                            <div
                              className="qty checkout-qty"
                              aria-label={`Jumlah ${p.name}`}
                            >
                              <button
                                type="button"
                                aria-label={`Kurangi ${p.name}`}
                                onClick={() => step(p.id, -1)}
                              >
                                −
                              </button>
                              <span>{cart[p.id]}</span>
                              <button
                                type="button"
                                aria-label={`Tambah ${p.name}`}
                                onClick={() => step(p.id, 1)}
                              >
                                +
                              </button>
                            </div>
                            <strong className="checkout-item-total">
                              {money(p.price * cart[p.id])}
                            </strong>
                          </div>
                        ))}
                    </div>
                    <div className="checkout-subtotal">
                      <span>Subtotal</span>
                      <strong>{money(total)}</strong>
                    </div>
                  </section>

                  <section className="checkout-card loyalty-checkout-card">
                    <div className="checkout-card-heading">
                      <span className="section-icon">
                        <StarIcon />
                      </span>
                      <h2>Poin Loyalty</h2>
                    </div>
                    <div className="loyalty-summary">
                      <StarIcon />
                      <p>
                        Poin Anda saat ini:{" "}
                        <strong>{account.loyalty} poin</strong>
                        <small>
                          Kumpulkan poin dari setiap pembelian dan tukarkan
                          sesuai reward yang tersedia.
                        </small>
                      </p>
                    </div>
                    <div className="voucher-list loyalty-reward-list">
                      {(account.rewards || []).map((reward) => {
                        const selected = Number(selectedRewardId) === reward.id;
                        const unavailable =
                          !reward.eligible_balance ||
                          Boolean(selectedVoucherId);
                        return (
                          <article
                            className={`voucher-option ${selected ? "selected" : ""}`}
                            key={reward.id}
                          >
                            <StarIcon />
                            <span>
                              <strong>{reward.name}</strong>
                              <small>
                                {reward.points_required} poin · minimum{" "}
                                {money(reward.minimum_order)}
                              </small>
                              <small>
                                {reward.reward_type === "PERCENT"
                                  ? `${reward.reward_value}% diskon`
                                  : `${money(reward.reward_value)} diskon`}
                                {reward.maximum_discount
                                  ? ` · maks. ${money(reward.maximum_discount)}`
                                  : ""}
                              </small>
                            </span>
                            <button
                              type="button"
                              className={selected ? "primary" : ""}
                              disabled={unavailable}
                              title={
                                selectedVoucherId
                                  ? "Tidak dapat digabung dengan voucher"
                                  : reward.ineligible_reason || ""
                              }
                              onClick={() =>
                                setSelectedRewardId(selected ? null : reward.id)
                              }
                            >
                              {selected
                                ? "Dipilih"
                                : unavailable
                                  ? reward.ineligible_reason ||
                                    "Voucher dipilih"
                                  : "Pakai"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                    {loyaltyQuoteBusy && (
                      <p className="voucher-feedback">
                        Memvalidasi Loyalty Reward…
                      </p>
                    )}
                    {loyaltyQuoteError && (
                      <p className="voucher-feedback error" role="alert">
                        {loyaltyQuoteError}
                      </p>
                    )}
                    {loyaltyQuote && (
                      <p className="voucher-feedback success">
                        Reward valid · {loyaltyQuote.points_redeemed} poin ·
                        hemat {money(loyaltyQuote.loyalty_discount)}
                      </p>
                    )}
                  </section>

                  <section className="checkout-card voucher-checkout-card">
                    <div className="checkout-card-heading">
                      <span className="section-icon">
                        <TicketIcon />
                      </span>
                      <h2>Voucher</h2>
                    </div>
                    <div className="voucher-list">
                      {(account.vouchers || []).map((voucher) => {
                        const selected =
                          Number(selectedVoucherId) === voucher.id;
                        const selectable = voucher.state === "CLAIMED";
                        return (
                          <article
                            className={`voucher-option ${selected ? "selected" : ""}`}
                            key={voucher.id}
                          >
                            <TicketIcon />
                            <span>
                              <strong>{voucher.title}</strong>
                              <small>{voucher.terms}</small>
                              <small>
                                Minimum {money(voucher.minimum_order)} ·{" "}
                                {voucher.voucher_type === "PERCENT"
                                  ? `${voucher.discount_value}%`
                                  : money(voucher.discount_value)}
                                {voucher.max_discount
                                  ? ` · maks. ${money(voucher.max_discount)}`
                                  : ""}
                              </small>
                            </span>
                            {voucher.state === "AVAILABLE" ? (
                              <button
                                type="button"
                                disabled={busy || Boolean(selectedRewardId)}
                                onClick={() =>
                                  run(async () => {
                                    await api("voucher-claim", {
                                      promotionId: voucher.id,
                                    });
                                    showTransientMessage(
                                      "Voucher berhasil diklaim.",
                                    );
                                  })
                                }
                              >
                                Klaim
                              </button>
                            ) : selectable ? (
                              <button
                                type="button"
                                disabled={Boolean(selectedRewardId)}
                                className={selected ? "primary" : ""}
                                onClick={() =>
                                  setSelectedVoucherId(
                                    selected ? null : voucher.id,
                                  )
                                }
                              >
                                {selected ? "Dipilih" : "Pakai"}
                              </button>
                            ) : (
                              <span className="voucher-state">
                                {voucher.state}
                              </span>
                            )}
                          </article>
                        );
                      })}
                      {!account.vouchers?.length && (
                        <div className="voucher-empty-state">
                          <TicketIcon />
                          <span>
                            <strong>Belum ada voucher tersedia</strong>
                            <small>
                              Voucher aktif yang dapat diklaim akan tampil di
                              sini.
                            </small>
                          </span>
                        </div>
                      )}
                    </div>
                    {voucherQuoteBusy && (
                      <p className="voucher-feedback">Memvalidasi voucher…</p>
                    )}
                    {voucherQuoteError && (
                      <p className="voucher-feedback error" role="alert">
                        {voucherQuoteError}
                      </p>
                    )}
                    {voucherQuote && (
                      <p className="voucher-feedback success">
                        Voucher valid · hemat{" "}
                        {money(voucherQuote.voucher_discount)}
                      </p>
                    )}
                  </section>

                  <section className="checkout-card delivery-checkout-card">
                    <div className="checkout-card-heading">
                      <span className="section-icon">
                        <LocationIcon />
                      </span>
                      <h2>Pengiriman</h2>
                    </div>
                    <label className="checkout-select-label">
                      Alamat pengantaran
                      <select
                        name="address"
                        required
                        value={selectedCheckoutAddress?.id || ""}
                        onChange={(event) => {
                          setDeliveryQuote(null);
                          setDeliveryQuoteError("");
                          setCheckoutAddressId(event.target.value);
                        }}
                      >
                        {account.addresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.label} · {address.detail}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="checkout-address-actions">
                      <button
                        type="button"
                        className="quick-address-toggle"
                        aria-expanded={quickAddressOpen}
                        onClick={() => setQuickAddressOpen((open) => !open)}
                      >
                        {quickAddressOpen
                          ? "Tutup form alamat"
                          : "+ Tambah lokasi lain"}
                      </button>
                    </div>
                    {quickAddressOpen && (
                      <div
                        className="checkout-quick-address"
                        aria-label="Tambah lokasi pengantaran"
                      >
                        <div className="quick-address-heading">
                          <LocationIcon />
                          <span>
                            <strong>Lokasi pengantaran baru</strong>
                            <small>
                              Alamat disimpan ke akun dan langsung dipakai untuk
                              checkout ini.
                            </small>
                          </span>
                        </div>
                        <div className="quick-address-fields">
                          <label>
                            Label alamat
                            <input
                              name="quickAddressLabel"
                              placeholder="Rumah / Kantor / Lainnya"
                              minLength="2"
                              disabled={quickAddressBusy}
                            />
                          </label>
                          <label>
                            Alamat lengkap
                            <textarea
                              name="quickAddressDetail"
                              placeholder="Nama jalan, nomor, patokan, RT/RW"
                              minLength="10"
                              disabled={quickAddressBusy}
                            />
                          </label>
                        </div>
                        <div className="quick-address-location">
                          <button
                            type="button"
                            className="location-button"
                            data-latitude-field="quickAddressLatitude"
                            data-longitude-field="quickAddressLongitude"
                            onClick={useDeviceLocation}
                            disabled={quickAddressBusy}
                          >
                            Gunakan lokasi perangkat
                          </button>
                          <input name="quickAddressLatitude" type="hidden" />
                          <input name="quickAddressLongitude" type="hidden" />
                          <small>
                            Titik lokasi dipakai untuk kalkulasi ongkir. Input
                            koordinat teknis tidak ditampilkan.
                          </small>
                        </div>
                        <div className="quick-address-buttons">
                          <button
                            type="button"
                            className="primary"
                            disabled={quickAddressBusy}
                            onClick={saveQuickAddress}
                          >
                            {quickAddressBusy
                              ? "Menyimpan…"
                              : "Simpan dan gunakan alamat"}
                          </button>
                          <button
                            type="button"
                            disabled={quickAddressBusy}
                            onClick={() => setQuickAddressOpen(false)}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                    {selectedCheckoutAddress ? (
                      <div className="delivery-summary">
                        <LocationIcon />
                        <span>
                          <strong>{selectedCheckoutAddress.label}</strong>
                          <small>{selectedCheckoutAddress.detail}</small>
                        </span>
                      </div>
                    ) : (
                      <p className="checkout-warning">
                        Tambahkan lokasi pengantaran untuk melanjutkan checkout.
                      </p>
                    )}
                    <div className="delivery-rules">
                      <TruckIcon />
                      <span>
                        <strong>Jarak dan ongkir dihitung otomatis</strong>
                        <small>
                          Gratis hingga {deliveryQuote?.free_radius_km ?? 5} km.
                          Di atasnya mengikuti konfigurasi pengiriman dan radius
                          layanan maksimal {deliveryQuote?.max_radius_km ?? 15}{" "}
                          km.
                        </small>
                      </span>
                    </div>
                    {deliveryQuoteBusy && (
                      <div className="delivery-quote-state" role="status">
                        Menghitung jarak dan ongkir…
                      </div>
                    )}
                    {deliveryQuoteError && (
                      <div
                        className="delivery-quote-state unavailable"
                        role="alert"
                      >
                        {deliveryQuoteError}
                      </div>
                    )}
                    {deliveryQuote && (
                      <div
                        className={`delivery-quote-state ${deliveryQuote.available ? (deliveryQuote.free_delivery ? "free" : "paid") : "unavailable"}`}
                        role={deliveryQuote.available ? "status" : "alert"}
                      >
                        <strong>
                          {deliveryQuote.available
                            ? `${Number(deliveryQuote.distance_km).toFixed(1)} km · ${deliveryQuote.free_delivery ? "GRATIS ONGKIR" : money(deliveryQuote.delivery_fee)}`
                            : "Area belum terjangkau"}
                        </strong>
                        <span>{deliveryQuote.message}</span>
                      </div>
                    )}
                  </section>

                  <section className="checkout-card payment-method-card">
                    <div className="checkout-card-heading">
                      <span className="section-icon">
                        <WalletIcon />
                      </span>
                      <h2>Metode Pembayaran</h2>
                    </div>
                    <label className="checkout-select-label sr-label">
                      Metode pembayaran
                      <select name="method">
                        <option value="CASH">Tunai saat diterima</option>
                        <option value="BANK_TRANSFER">
                          Transfer bank · verifikasi admin
                        </option>
                        <option value="QRIS">QRIS</option>
                      </select>
                    </label>
                  </section>
                </div>

                <aside className="checkout-summary-card">
                  <div className="checkout-card-heading">
                    <span className="section-icon">
                      <WalletIcon />
                    </span>
                    <h2>Rincian Pembayaran</h2>
                  </div>
                  <div className="payment-line">
                    <span>Subtotal</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <div className="payment-line">
                    <span>Ongkir</span>
                    <strong
                      className={
                        deliveryQuote?.available ? "" : "pending-value"
                      }
                    >
                      {deliveryQuoteBusy
                        ? "Menghitung…"
                        : deliveryQuote?.available
                          ? deliveryQuote.free_delivery
                            ? "GRATIS"
                            : money(deliveryQuote.delivery_fee)
                          : deliveryQuote
                            ? "Di luar jangkauan"
                            : "Belum dihitung"}
                    </strong>
                  </div>
                  <div className="payment-line">
                    <span>Voucher</span>
                    <strong>
                      {voucherQuote?.voucher_discount
                        ? `−${money(voucherQuote.voucher_discount)}`
                        : money(0)}
                    </strong>
                  </div>
                  <div className="payment-line">
                    <span>Loyalty Reward</span>
                    <strong>
                      {loyaltyQuote?.loyalty_discount
                        ? `−${money(loyaltyQuote.loyalty_discount)}`
                        : money(0)}
                    </strong>
                  </div>
                  <div className="payment-total">
                    <span>Total akhir</span>
                    <strong>
                      {deliveryQuote?.available
                        ? money(checkoutFinalTotal)
                        : "—"}
                    </strong>
                  </div>
                  <p className="server-calculation-note">
                    {deliveryQuote?.message ||
                      deliveryQuoteError ||
                      "Total akhir ditampilkan setelah server memvalidasi alamat."}
                  </p>
                  <button
                    className="primary checkout-submit"
                    disabled={
                      busy ||
                      deliveryQuoteBusy ||
                      voucherQuoteBusy ||
                      loyaltyQuoteBusy ||
                      Boolean(selectedVoucherId && !voucherQuote) ||
                      Boolean(selectedRewardId && !loyaltyQuote) ||
                      !account.addresses.length ||
                      !deliveryQuote?.available
                    }
                  >
                    {busy
                      ? "Membuat Pesanan…"
                      : deliveryQuoteBusy
                        ? "Menghitung Ongkir…"
                        : deliveryQuote && !deliveryQuote.available
                          ? "Alamat Di Luar Jangkauan"
                          : "Buat Pesanan"}
                    <ArrowIcon />
                  </button>
                  <div className="checkout-trust">
                    <ShieldIcon />
                    <span>
                      Pesananmu diproses dengan aman menggunakan kalkulasi
                      existing.
                    </span>
                  </div>
                </aside>
              </form>
            )}
          </section>
        )}
        {role === "CUSTOMER" && view === "order-success" && (
          <CustomerTracking
            order={focusedOrder}
            justCreated={Boolean(
              lastCreatedOrderId && focusedOrder?.id === lastCreatedOrderId,
            )}
            onBack={() => goToCustomerOrders("all")}
            onSupport={openCustomerSupport}
          />
        )}
        {role === "CUSTOMER" && view === "account" && (
          <>
            <section className="account-overview" aria-label="Menu akun">
              <div>
                <span className="eyebrow">AKUN PELANGGAN</span>
                <h2>{user.name}</h2>
                <p>Kelola pesanan, lokasi pengantaran, dan profilmu.</p>
              </div>
            </section>
            <div className="columns account-columns">
              <section className="panel" id="account-address">
                <h2>Alamat pengantaran</h2>
                {account.addresses.map((a) => (
                  <div className="line" key={a.id}>
                    <span>
                      <strong>{a.label}</strong>{" "}
                      {a.is_default === 1 && (
                        <span className="badge">DEFAULT</span>
                      )}
                      <br />
                      {a.detail}
                    </span>
                    <span className="actions">
                      {a.is_default !== 1 && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() => api("address-default", { id: a.id }))
                          }
                        >
                          Jadikan default
                        </button>
                      )}
                      <button onClick={() => setEditingAddress(a.id)}>
                        Ubah
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(() => api("address-remove", { id: a.id }))
                        }
                      >
                        Hapus
                      </button>
                    </span>
                  </div>
                ))}
                <form
                  key={editingAddress || "new"}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(async () => {
                      await api(
                        editingAddress ? "address-replace" : "address",
                        {
                          ...(editingAddress ? { id: editingAddress } : {}),
                          label: f.get("label"),
                          detail: f.get("detail"),
                          latitude: f.get("latitude"),
                          longitude: f.get("longitude"),
                          isDefault: f.get("isDefault") === "on",
                        },
                      );
                      setEditingAddress(null);
                      e.target.reset();
                    });
                  }}
                >
                  <h2>{editingAddress ? "Ubah alamat" : "Tambah alamat"}</h2>
                  <label>
                    Label
                    <input
                      name="label"
                      defaultValue={
                        account.addresses.find((a) => a.id === editingAddress)
                          ?.label || ""
                      }
                      placeholder="Rumah / Kantor"
                      required
                      minLength="2"
                    />
                  </label>
                  <label>
                    Alamat lengkap
                    <textarea
                      name="detail"
                      defaultValue={
                        account.addresses.find((a) => a.id === editingAddress)
                          ?.detail || ""
                      }
                      minLength="10"
                      required
                    />
                  </label>
                  <div className="location-card">
                    <div className="location-card-heading">
                      <LocationIcon />
                      <div>
                        <strong>Titik lokasi pengantaran</strong>
                        <small>
                          Dipakai hanya untuk menghitung jarak dan ongkir.
                        </small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="location-button"
                      onClick={useDeviceLocation}
                    >
                      Gunakan lokasi perangkat
                    </button>
                    <input name="latitude" type="hidden" />
                    <input name="longitude" type="hidden" />
                    <label className="consent-field">
                      <input
                        name="isDefault"
                        type="checkbox"
                        defaultChecked={
                          account.addresses.find((a) => a.id === editingAddress)
                            ?.is_default === 1
                        }
                      />
                      <span>Jadikan alamat default</span>
                    </label>
                    <small>
                      Koordinat disimpan untuk ongkir, tetapi tidak ditampilkan
                      sebagai input teknis. Jika lokasi perangkat tidak dipilih,
                      titik lama dipertahankan; presisi pin peta akan dilengkapi
                      pada integrasi Maps berikutnya.
                    </small>
                  </div>
                  <div className="actions">
                    <button className="primary" disabled={busy}>
                      Simpan alamat
                    </button>
                    {editingAddress && (
                      <button
                        type="button"
                        onClick={() => setEditingAddress(null)}
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </form>
              </section>
              <section className="panel" id="account-settings">
                <h2>Pengaturan Akun</h2>
                <p>Perbarui data profil dan password akunmu dengan aman.</p>
                <form
                  key={
                    (account.profile?.email || user.email) +
                    (account.profile?.birth_date || "")
                  }
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(async () => {
                      const response = await api("profile", {
                        name: f.get("name"),
                        email: f.get("email"),
                        phone: f.get("phone"),
                        birthDate: f.get("birthDate"),
                        currentPassword: f.get("currentPassword"),
                        newPassword: f.get("newPassword"),
                      });
                      setUser(response.user);
                      setMessage("Profil diperbarui");
                      e.target.reset();
                    });
                  }}
                >
                  <label>
                    Nama
                    <input
                      name="name"
                      defaultValue={account.profile?.name || user.name}
                      required
                      minLength="2"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      defaultValue={account.profile?.email || user.email}
                      required
                    />
                  </label>
                  <label>
                    Nomor HP
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={account.profile?.phone || ""}
                      required
                    />
                  </label>
                  <label>
                    Tanggal Lahir
                    <input
                      name="birthDate"
                      type="date"
                      defaultValue={account.profile?.birth_date || ""}
                      required
                    />
                  </label>
                  <label>
                    Password saat ini (jika mengganti password)
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                    />
                  </label>
                  <label>
                    Password baru (opsional, minimal 12 karakter)
                    <input
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Simpan profil
                  </button>
                </form>
              </section>
              <section className="panel" id="account-loyalty">
                <h2>Poin loyalitas</h2>
                <div className="big-number">{account.loyalty} poin</div>
                <p>
                  Setiap kelipatan Rp10.000 nilai produk bersih menghasilkan 1
                  poin setelah pesanan selesai.
                </p>
                {(account.rewards || []).map((reward) => (
                  <div className="line" key={reward.id}>
                    <span>
                      <strong>{reward.name}</strong>
                      <br />
                      {reward.points_required} poin ·{" "}
                      {reward.reward_type === "PERCENT"
                        ? `${reward.reward_value}%`
                        : money(reward.reward_value)}
                    </span>
                    <span className="badge">
                      {reward.eligible_balance
                        ? "TERSEDIA"
                        : reward.ineligible_reason}
                    </span>
                  </div>
                ))}
                {account.transactions.map((t) => (
                  <div className="line" key={t.id}>
                    <span>
                      Pesanan #{t.order_id} · {t.kind}
                    </span>
                    <strong>
                      {t.amount > 0 ? "+" : ""}
                      {t.amount}
                    </strong>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}
        {role === "OWNER" && view === "reports" && (
          <section className="panel">
            <h2>Ringkasan operasional</h2>
            <p>
              Pesanan dihitung menurut tanggal dibuat; revenue menurut tanggal
              pembayaran diverifikasi. Waktu mengikuti Asia/Jakarta.
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const date = new FormData(event.currentTarget).get("date");
                setBusy(true);
                setError("");
                try {
                  setReport(
                    await api("report?date=" + encodeURIComponent(date)),
                  );
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Tanggal
                <input
                  key={report?.date}
                  name="date"
                  type="date"
                  defaultValue={report?.date || ""}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                Lihat laporan
              </button>
            </form>
            {report && (
              <>
                <div className="stats">
                  {[
                    ["Pesanan dibuat", report.orders.count],
                    ["Nilai pesanan aktif", money(report.orders.order_value)],
                    ["Pembayaran lunas", report.paid.count],
                    ["Revenue terverifikasi", money(report.paid.revenue)],
                  ].map(([label, value]) => (
                    <div className="stat" key={label}>
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <h2>Status pesanan</h2>
                {report.statuses.map((item) => (
                  <div className="line" key={item.status}>
                    <span>{item.status}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {!report.statuses.length && (
                  <p>Belum ada pesanan pada tanggal ini.</p>
                )}
                <h2>Produk terlaris</h2>
                {report.products.map((item) => (
                  <div className="line" key={item.product_id + ":" + item.name}>
                    <span>
                      {item.name} · {item.quantity} item
                    </span>
                    <strong>{money(item.value)}</strong>
                  </div>
                ))}
              </>
            )}
          </section>
        )}
        {role === "OWNER" && view === "settings" && (
          <section className="panel narrow">
            <h2>Pengaturan café</h2>
            <form
              key={
                settings.brandName +
                settings.rupiahPerPoint +
                settings.businessWhatsApp +
                settings.deliveryFreeKm +
                settings.deliveryFeePerKm +
                settings.deliveryMaxKm
              }
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  api("settings", {
                    brandName: f.get("brandName"),
                    rupiahPerPoint: 10000,
                    businessWhatsApp: f.get("businessWhatsApp"),
                    businessLatitude: Number(f.get("businessLatitude")),
                    businessLongitude: Number(f.get("businessLongitude")),
                    deliveryFreeKm: Number(f.get("deliveryFreeKm")),
                    deliveryFeePerKm: Number(f.get("deliveryFeePerKm")),
                    deliveryMaxKm: Number(f.get("deliveryMaxKm")),
                    printerSimulation: f.get("printerSimulation") === "on",
                    adminPrinter: f.get("adminPrinter"),
                    kitchenPrinter: f.get("kitchenPrinter"),
                  }),
                );
              }}
            >
              <label>
                Nama café
                <input
                  name="brandName"
                  defaultValue={settings.brandName}
                  minLength="2"
                  required
                />
              </label>
              <label>
                Nilai produk per 1 poin (tetap)
                <input
                  name="rupiahPerPoint"
                  type="number"
                  value="10000"
                  readOnly
                  required
                />
              </label>
              <label>
                WhatsApp Admin
                <input
                  name="businessWhatsApp"
                  defaultValue={settings.businessWhatsApp}
                  required
                />
              </label>
              <div className="columns compact-columns">
                <label>
                  Latitude Warkost
                  <input
                    name="businessLatitude"
                    type="number"
                    step="any"
                    defaultValue={settings.businessLatitude}
                    required
                  />
                </label>
                <label>
                  Longitude Warkost
                  <input
                    name="businessLongitude"
                    type="number"
                    step="any"
                    defaultValue={settings.businessLongitude}
                    required
                  />
                </label>
              </div>
              <div className="columns compact-columns">
                <label>
                  Radius gratis (km)
                  <input
                    name="deliveryFreeKm"
                    type="number"
                    min="0"
                    step="0.1"
                    defaultValue={settings.deliveryFreeKm}
                    required
                  />
                </label>
                <label>
                  Biaya per km tambahan
                  <input
                    name="deliveryFeePerKm"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={settings.deliveryFeePerKm}
                    required
                  />
                </label>
                <label>
                  Radius maksimal (km)
                  <input
                    name="deliveryMaxKm"
                    type="number"
                    min="0.1"
                    step="0.1"
                    defaultValue={settings.deliveryMaxKm}
                    required
                  />
                </label>
              </div>
              <label>
                Profil printer Admin
                <input
                  name="adminPrinter"
                  defaultValue={settings.adminPrinter}
                  required
                />
              </label>
              <label>
                Profil printer Kitchen
                <input
                  name="kitchenPrinter"
                  defaultValue={settings.kitchenPrinter}
                  required
                />
              </label>
              <label className="checkbox">
                <input
                  name="printerSimulation"
                  type="checkbox"
                  defaultChecked={settings.printerSimulation}
                />
                Mode simulasi printer sampai hardware LAN terpasang
              </label>
              <p>
                Ongkir setelah radius gratis dihitung per kilometer tambahan
                yang mulai terpakai. Radius gratis tidak boleh melebihi radius
                maksimal.
              </p>
              <button className="primary" disabled={busy}>
                Simpan pengaturan
              </button>
            </form>
          </section>
        )}
        {role === "OWNER" && view === "staff" && (
          <section className="panel">
            <h2>Kelola staf</h2>
            <p>
              Owner dapat membuat Manager, Admin, dan Driver. Password lama
              tidak pernah ditampilkan.
            </p>
            {staff.map((member) => (
              <div className="line" key={member.id}>
                <span>
                  <strong>{member.name}</strong> · {member.role}
                  <br />
                  {member.email} · {member.phone || "Nomor belum diisi"} ·{" "}
                  {member.active ? "Aktif" : "Nonaktif"}
                </span>
                {member.role === "DRIVER" ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        api("driver-active", {
                          id: member.id,
                          active: !member.active,
                        }),
                      )
                    }
                  >
                    {member.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formElement = event.currentTarget;
                      const form = new FormData(formElement);
                      run(async () => {
                        await api("staff-password", {
                          id: member.id,
                          password: form.get("password"),
                        });
                        formElement.reset();
                        setMessage(
                          "Password staf diperbarui dan sesi lama dicabut",
                        );
                      });
                    }}
                  >
                    <input
                      name="password"
                      type="password"
                      minLength="14"
                      placeholder="Password baru"
                      required
                    />
                    <button disabled={busy}>Reset password</button>
                  </form>
                )}
              </div>
            ))}
            <h2>Tambah staf</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  await api("staff", {
                    role: f.get("role"),
                    name: f.get("name"),
                    email: f.get("email"),
                    password: f.get("password"),
                    phone: f.get("phone"),
                  });
                  e.target.reset();
                });
              }}
            >
              <label>
                Role
                <select name="role" required defaultValue="MANAGER">
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                  <option value="DRIVER">Driver</option>
                </select>
              </label>
              <label>
                Nama
                <input name="name" minLength="2" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Nomor WhatsApp (wajib untuk Driver)
                <input name="phone" placeholder="08xxxxxxxxxx" />
              </label>
              <label>
                Password awal (minimal 14 karakter)
                <input
                  name="password"
                  type="password"
                  minLength="14"
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                Buat akun staf
              </button>
            </form>
          </section>
        )}
        {["ADMIN", "OWNER"].includes(role) && view === "customers" && (
          <section className="panel">
            <h2>Daftar pelanggan</h2>
            <p>
              {role === "OWNER"
                ? "Pesanan aktif harus diselesaikan sebelum akun dinonaktifkan."
                : "Admin dapat mencari pelanggan dan menangani dukungan akun. Aktivasi akun dikelola Owner."}
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const query = new FormData(event.currentTarget)
                  .get("search")
                  .toString()
                  .trim();
                setBusy(true);
                setError("");
                try {
                  await loadCustomers(query);
                  setCustomerSearch(query);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Cari nama atau email
                <input
                  name="search"
                  defaultValue={customerSearch}
                  maxLength="80"
                />
              </label>
              <button className="primary" disabled={busy}>
                Cari pelanggan
              </button>
            </form>
            {customers.map((customer) => (
              <div className="line" key={customer.id}>
                <span>
                  <strong>{customer.name}</strong> · {customer.email}
                  <br />
                  {customer.active ? "Aktif" : "Nonaktif"} ·{" "}
                  {customer.order_count} pesanan · {customer.points} poin
                </span>
                {role === "OWNER" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        api("customer-active", {
                          id: customer.id,
                          active: !customer.active,
                        }),
                      )
                    }
                  >
                    {customer.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                )}
              </div>
            ))}
            {!customers.length && <p>Belum ada pelanggan yang cocok.</p>}
            {customerCursor && (
              <button
                className="refresh"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await loadCustomers(customerSearch, customerCursor);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Muat pelanggan lain
              </button>
            )}
          </section>
        )}
        {["MANAGER", "OWNER"].includes(role) && view === "promotions" && (
          <section className="panel">
            <h2>Promo customer</h2>
            <p>
              Promo hanya menjadi materi komunikasi. Harga checkout tidak
              berubah otomatis dan tetap dihitung server-side.
            </p>
            {promotions.map((promotion) => (
              <PromotionEditor
                key={promotion.id}
                promotion={promotion}
                busy={busy}
                onSave={(body) =>
                  run(async () => {
                    await api("promotion", body);
                    setMessage("Promo diperbarui");
                  })
                }
              />
            ))}
            {!promotions.length && <p>Belum ada promo tersimpan.</p>}
            <h2>Tambah promo</h2>
            <PromotionEditor
              busy={busy}
              onSave={(body) =>
                run(async () => {
                  await api("promotion", body);
                  setMessage("Promo dibuat");
                })
              }
            />
          </section>
        )}
        {["MANAGER", "OWNER"].includes(role) && view === "products" && (
          <section className="panel">
            <h2>Kelola kategori</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  await api("category", { name: f.get("name") });
                  e.target.reset();
                });
              }}
            >
              <label>
                Nama kategori baru
                <input name="name" required minLength="2" />
              </label>
              <button className="primary" disabled={busy}>
                Tambah kategori
              </button>
            </form>
            {inventory.categories.map((c) => (
              <div className="line" key={c.id}>
                <span>
                  {c.name} · {c.active ? "Aktif" : "Nonaktif"}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api("category", {
                        id: c.id,
                        name: c.name,
                        active: !c.active,
                      }),
                    )
                  }
                >
                  {c.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ))}
            <h2>Kelola produk</h2>
            {inventory.products.map((p) => (
              <ProductEditor
                key={p.id}
                product={p}
                categories={inventory.categories}
                busy={busy}
                onSave={saveProductWithImage}
              />
            ))}
            <h2>Tambah menu</h2>
            <ProductEditor
              categories={inventory.categories}
              busy={busy}
              onSave={saveProductWithImage}
            />
          </section>
        )}
        {role === "OWNER" && view === "loyalty-rules" && (
          <section className="panel">
            <h2>Loyalty Reward</h2>
            <p>
              Atur reward penukaran poin. Perolehan poin tetap 1 poin per
              kelipatan Rp10.000 nilai produk bersih.
            </p>
            {loyaltyRules.map((rule) => (
              <LoyaltyRuleEditor
                key={rule.id}
                rule={rule}
                busy={busy}
                onSave={(body) =>
                  run(async () => {
                    await api("loyalty-reward", body);
                    setMessage("Aturan Loyalty Reward diperbarui");
                  })
                }
              />
            ))}
            {!loyaltyRules.length && <p>Belum ada Loyalty Reward.</p>}
            <h2>Tambah reward</h2>
            <LoyaltyRuleEditor
              busy={busy}
              onSave={(body) =>
                run(async () => {
                  await api("loyalty-reward", body);
                  setMessage("Loyalty Reward dibuat");
                })
              }
            />
          </section>
        )}
        {["MANAGER", "OWNER"].includes(role) && view === "stock" && (
          <section className="panel">
            <h2>Stok produk</h2>
            <p>
              Manager dan Owner dapat menyesuaikan stok. Semua perubahan selalu
              dicatat pada ledger dan audit log.
            </p>
            {stock.products.map((product) => (
              <form
                className="stock-row"
                key={product.id + ":" + product.stock_quantity}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  run(async () => {
                    await api("stock", {
                      productId: product.id,
                      quantity: Number(form.get("quantity")),
                      reason: form.get("reason"),
                    });
                    setMessage("Stok " + product.name + " diperbarui");
                  });
                }}
              >
                <div>
                  <strong>{product.name}</strong>
                  <small className="notification-date">
                    {product.prep_station === "KITCHEN"
                      ? "Dapur"
                      : "Admin · minuman"}
                    {" · "}stok {product.stock_quantity}
                  </small>
                </div>
                <input
                  name="quantity"
                  type="number"
                  placeholder="+ / − jumlah"
                  required
                />
                <input
                  name="reason"
                  minLength="3"
                  maxLength="240"
                  placeholder="Alasan perubahan"
                  required
                />
                <button className="primary" disabled={busy}>
                  Simpan
                </button>
              </form>
            ))}
            <h2>100 pergerakan terakhir</h2>
            {stock.movements.map((movement) => (
              <div className="line" key={movement.id}>
                <span>
                  <strong>{movement.product_name}</strong> · {movement.kind}
                  <br />
                  {movement.reason} · {movement.actor_name || "Sistem"}
                </span>
                <strong>
                  {movement.quantity_delta > 0 ? "+" : ""}
                  {movement.quantity_delta}
                  {" → "}
                  {movement.balance_after}
                </strong>
              </div>
            ))}
          </section>
        )}
        {role === "OWNER" && view === "audit" && (
          <section className="panel">
            <h2>Audit log</h2>
            <p>
              Catatan bersifat hanya-baca dan diurutkan dari aktivitas terbaru.
            </p>
            {audit.logs.map((log) => (
              <div className="line audit-row" key={log.id}>
                <span>
                  <strong>{log.action}</strong>
                  <br />
                  {log.actor_name || "Sistem"} · {log.actor_role || "SYSTEM"} ·{" "}
                  {log.created_at}
                  {log.details && (
                    <small className="notification-date">{log.details}</small>
                  )}
                </span>
              </div>
            ))}
            {!audit.logs.length && <p>Belum ada aktivitas tercatat.</p>}
            {audit.nextCursor && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const next = await api("audit?before=" + audit.nextCursor);
                    setAudit({
                      logs: [...audit.logs, ...next.logs],
                      nextCursor: next.nextCursor,
                    });
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Muat aktivitas lama
              </button>
            )}
          </section>
        )}
        {role === "ADMIN" && view === "admin-stock" && (
          <section className="panel admin-stock-native-placeholder">
            <h2>Stok Minuman</h2>
            <p>Memuat inventori minuman read-only untuk Admin…</p>
          </section>
        )}
        {["ADMIN", "KITCHEN", "OWNER"].includes(role) &&
          view === "printing" && (
            <section className="panel">
              <h2>Antrean cetak struk 80mm</h2>
              <p>
                Admin menerima seluruh item; Kitchen hanya menerima makanan.
                Owner memiliki akses pantau saja.
              </p>
              {printJobs.map((job) => (
                <div className="line" key={job.id}>
                  <span>
                    <strong>Pesanan #{job.order_id}</strong> · {job.station}
                    <br />
                    {job.status} · percobaan {job.attempts} · cetak ulang{" "}
                    {job.reprint_count}
                  </span>
                  {role !== "OWNER" &&
                    ["FAILED", "PRINTED", "REPRINTED"].includes(job.status) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(() => api("print-retry", { id: job.id }))
                        }
                      >
                        Cetak ulang
                      </button>
                    )}
                </div>
              ))}
              {!printJobs.length && <p>Belum ada print job.</p>}
            </section>
          )}
        {role && role !== "CUSTOMER" && view === "notifications" && (
          <section className="panel narrow">
            <h2>Kabar terbaru</h2>
            {alerts.notifications.length ? (
              alerts.notifications.map((n) => (
                <div className={n.read_at ? "line" : "line unread"} key={n.id}>
                  <div>
                    <strong>{n.message}</strong>
                    <small className="notification-date">{n.created_at}</small>
                  </div>
                  {!n.read_at && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(() => api("notification-read", { id: n.id }))
                      }
                    >
                      Tandai dibaca
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p>Belum ada notifikasi.</p>
            )}
          </section>
        )}
        {role && view === "orders" && (
          <>
            {role === "CUSTOMER" && (
              <section className="customer-orders-heading">
                <div className="customer-page-title">
                  <span className="eyebrow">PESANAN WARKOST</span>
                  <h1>Pesanan</h1>
                  <p>Lihat dan pantau semua pesanan Anda.</p>
                </div>
                <button
                  className="orders-refresh"
                  onClick={() => run(async () => {})}
                  disabled={busy}
                >
                  {busy ? "Memperbarui…" : "Perbarui status"}
                </button>
                <div
                  className="customer-order-tabs"
                  aria-label="Filter pesanan"
                >
                  {[
                    ["all", "Semua"],
                    ["process", "Dalam Proses"],
                    ["completed", "Selesai"],
                    ["cancelled", "Dibatalkan"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className={orderFilter === key ? "active" : ""}
                      onClick={() => setOrderFilter(key)}
                    >
                      {label} <span>{customerOrderCounts[key]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {role !== "CUSTOMER" && (
              <button
                className="refresh"
                onClick={() => run(async () => {})}
                disabled={busy}
              >
                Perbarui status
              </button>
            )}
            {["ADMIN", "OWNER"].includes(role) && dashboard && (
              <div className="stats">
                {[
                  ["Order hari ini", dashboard.today.orders],
                  [
                    "Revenue terverifikasi hari ini",
                    money(dashboard.today.revenue),
                  ],
                  [
                    "Menunggu",
                    dashboard.statuses.find((s) => s.status === "PENDING")
                      ?.count || 0,
                  ],
                  [
                    "Disiapkan",
                    dashboard.statuses.find((s) => s.status === "PREPARING")
                      ?.count || 0,
                  ],
                  [
                    "Siap antar",
                    dashboard.statuses.find((s) => s.status === "READY")
                      ?.count || 0,
                  ],
                  [
                    "Dalam pengantaran",
                    dashboard.statuses
                      .filter((s) =>
                        ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(
                          s.status,
                        ),
                      )
                      .reduce((n, s) => n + s.count, 0),
                  ],
                  [
                    "Selesai",
                    dashboard.statuses.find((s) => s.status === "DELIVERED")
                      ?.count || 0,
                  ],
                  ["Pelanggan", dashboard.customers],
                  ["Driver terdaftar", dashboard.drivers],
                  ["Aktivitas poin", dashboard.loyalty],
                ].map(([label, value]) => (
                  <div className="stat" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
            {["ADMIN", "OWNER"].includes(role) && dashboard && (
              <div className="stats payment-stats">
                {["PENDING", "PAID", "FAILED", "EXPIRED"].map((status) => (
                  <div className="stat" key={status}>
                    <small>Pembayaran {status}</small>
                    <strong>
                      {dashboard.paymentStatuses?.find(
                        (item) => item.status === status,
                      )?.count || 0}
                    </strong>
                  </div>
                ))}
              </div>
            )}
            {role === "ADMIN" && (
              <section id="admin-order-tools" className="admin-order-tools">
                <label className="admin-order-search">
                  <span className="admin-svg-icon admin-search-icon">
                    <SearchIcon />
                  </span>
                  <span className="sr-only">Cari pesanan</span>
                  <input
                    type="search"
                    placeholder="Cari nomor pesanan, pelanggan, atau alamat..."
                    value={adminOrderSearch}
                    onChange={(event) =>
                      setAdminOrderSearch(event.target.value)
                    }
                  />
                </label>
                <div
                  className="admin-order-filters"
                  aria-label="Filter operasional"
                >
                  {ADMIN_ORDER_FILTERS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      data-filter={key}
                      className={adminOrderFilter === key ? "active" : ""}
                      aria-pressed={adminOrderFilter === key}
                      onClick={() => setAdminOrderFilter(key)}
                    >
                      {label} ({adminCounts[key]})
                    </button>
                  ))}
                </div>
              </section>
            )}
            {role === "DRIVER" && (
              <DriverTripControls
                orders={visibleOrders}
                busy={busy}
                action={(route) =>
                  run(async () => {
                    const result = await api(route, {});
                    setMessage(
                      route === "claim-all-deliveries"
                        ? `${result.count} pesanan berhasil diambil untuk trip ini`
                        : `${result.count} pesanan berhasil di-pickup`,
                    );
                  })
                }
              />
            )}
            <div
              className={
                role === "CUSTOMER"
                  ? "order-list customer-order-list"
                  : "order-list"
              }
            >
              {role === "DRIVER" &&
                visibleOrders.some((order) => order.available_to_claim) && (
                  <section className="panel">
                    <h2>Pesanan siap diantar</h2>
                    <p>
                      Ambil pesanan yang tersedia. Maksimal 5 pengantaran aktif.
                    </p>
                  </section>
                )}
              {visibleOrders.map((o) => (
                <Order
                  key={o.id}
                  order={o}
                  role={role}
                  busy={busy}
                  onTrack={openCustomerTracking}
                  onReorder={reorderItems}
                  onSupport={openCustomerSupport}
                  onChat={(type, orderId) => setChatTarget({ type, orderId })}
                  action={(route, body) =>
                    run(async () => {
                      await api(route, body);
                      if (role === "DRIVER")
                        window.dispatchEvent(
                          new CustomEvent("warkost:cod-batch-updated"),
                        );
                      setMessage("Pesanan #" + o.id + " diperbarui");
                    })
                  }
                />
              ))}
            </div>
            {!visibleOrders.length && (
              <div className="panel empty-state">
                <ReceiptIcon />
                <h2>
                  {role === "ADMIN"
                    ? adminOrderSearch.trim()
                      ? "Pesanan tidak ditemukan"
                      : adminOrderFilter === "all"
                        ? "Belum ada pesanan"
                        : `Tidak ada pesanan ${ADMIN_ORDER_FILTERS.find(({ key }) => key === adminOrderFilter)?.label.toLowerCase() || "pada filter ini"}`
                    : orderFilter === "completed"
                      ? "Belum ada pesanan selesai"
                      : orderFilter === "process"
                        ? "Tidak ada pesanan yang sedang berjalan"
                        : orderFilter === "cancelled"
                          ? "Belum ada pesanan dibatalkan"
                          : "Belum ada pesanan"}
                </h2>
                <p>
                  {role === "ADMIN"
                    ? "Ubah filter atau pencarian untuk melihat pesanan lain."
                    : "Pesananmu akan tampil di sini."}
                </p>
              </div>
            )}
            {nextOrderCursor && (
              <button
                className="refresh"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const page = await api("orders?before=" + nextOrderCursor);
                    setOrders((current) => {
                      const known = new Set(current.map((order) => order.id));
                      return [
                        ...current,
                        ...page.orders.filter((order) => !known.has(order.id)),
                      ].sort((a, b) => b.id - a.id);
                    });
                    setNextOrderCursor(page.nextCursor);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Muat pesanan lama
              </button>
            )}
          </>
        )}
      </main>
      {role === "CUSTOMER" && view === "menu" && count > 0 && (
        <button
          className="floating-cart customer-floating-cart"
          aria-label={`Buka keranjang, ${count} item, total ${money(total)}`}
          onClick={() => setOverlay("cart")}
        >
          <span className="floating-cart-icon">
            <CartIcon />
            <span>{count}</span>
          </span>
          <span className="floating-cart-summary">
            <small>{count} item di keranjang</small>
            <strong>{money(total)}</strong>
          </span>
          <span className="floating-cart-cta">
            Buka
            <ArrowIcon />
          </span>
        </button>
      )}
      {role === "CUSTOMER" && (
        <nav className="mobile-customer-nav" aria-label="Navigasi pelanggan">
          <button
            className={view === "menu" && !overlay ? "active" : ""}
            aria-label="Menu"
            onClick={() => {
              setOverlay(null);
              setView("menu");
            }}
          >
            <span className="mobile-nav-icon">
              <FoodIcon />
            </span>
            Menu
          </button>
          <button
            className={overlay === "cart" ? "active" : ""}
            aria-label="Keranjang"
            onClick={() => setOverlay("cart")}
          >
            <span className="mobile-nav-icon">
              <CartIcon />
              {count > 0 && <span className="mobile-nav-count">{count}</span>}
            </span>
            Keranjang
          </button>
          <button
            className={
              overlay === "account" || view === "account" ? "active" : ""
            }
            aria-label="Akun"
            onClick={() => setOverlay("account")}
          >
            <span className="mobile-nav-icon">
              <UserIcon />
            </span>
            Akun
          </button>
        </nav>
      )}
      {role === "CUSTOMER" && overlay && (
        <div
          className="sheet-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOverlay(null);
          }}
        >
          <section
            className={`quick-sheet ${overlay === "notifications" ? "notification-sheet" : ""} ${overlay === "support" ? "support-sheet" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              overlay === "cart"
                ? "Ringkasan keranjang"
                : overlay === "notifications"
                  ? "Notifikasi terbaru"
                  : overlay === "support"
                    ? "Bantuan Warkost"
                    : "Menu akun"
            }
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-heading">
              <div>
                <span className="eyebrow">
                  {overlay === "notifications"
                    ? "INFORMASI TERBARU"
                    : overlay === "support"
                      ? "BANTUAN WARKOST"
                      : "AKSES CEPAT"}
                </span>
                <h2>
                  {overlay === "cart"
                    ? "Keranjangmu"
                    : overlay === "notifications"
                      ? "Notifikasi"
                      : overlay === "support"
                        ? "Bantuan Warkost"
                        : "Akun saya"}
                </h2>
                {overlay === "notifications" && (
                  <p>
                    Informasi terbaru seputar pesanan, promo, dan akun Anda.
                  </p>
                )}
                {overlay === "support" && (
                  <p>Bantuan internal dengan konteks pesananmu.</p>
                )}
              </div>
              <button
                className="sheet-close"
                aria-label="Tutup"
                onClick={() => setOverlay(null)}
              >
                ×
              </button>
            </div>
            {overlay === "cart" && (
              <div className="quick-cart-content">
                {menu.products
                  .filter((product) => cart[product.id] > 0)
                  .map((product) => (
                    <div className="quick-cart-row" key={product.id}>
                      <Image
                        src={
                          product.image_url || demoProductImage(product.name)
                        }
                        alt=""
                        width={62}
                        height={62}
                        unoptimized={Boolean(product.image_url)}
                      />
                      <span>
                        <strong>{product.name}</strong>
                        <small>
                          {cart[product.id]} × {money(product.price)}
                        </small>
                      </span>
                      <div className="qty compact-qty">
                        <button
                          aria-label={`Kurangi ${product.name} dari keranjang`}
                          onClick={() => step(product.id, -1)}
                        >
                          −
                        </button>
                        <button
                          aria-label={`Tambah ${product.name} dari keranjang`}
                          onClick={() => step(product.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                {!count && <p>Keranjangmu masih kosong.</p>}
                <div className="sheet-total">
                  <span>Total sementara</span>
                  <strong>{money(total)}</strong>
                </div>
                <button
                  className="primary sheet-primary"
                  disabled={!count}
                  onClick={() => {
                    setOverlay(null);
                    setView("cart");
                  }}
                >
                  Lanjut ke checkout
                </button>
              </div>
            )}
            {overlay === "notifications" && (
              <div className="notification-center">
                <div
                  className="notification-filters"
                  aria-label="Filter notifikasi"
                >
                  {[
                    ["all", "Semua"],
                    ["order", "Pesanan"],
                    ["promo", "Promo"],
                    ["system", "Sistem"],
                  ].map(([key, label]) => {
                    const amount =
                      key === "all"
                        ? alerts.notifications.length
                        : alerts.notifications.filter(
                            (notification) =>
                              notificationCategory(notification.message) ===
                              key,
                          ).length;
                    return (
                      <button
                        key={key}
                        className={notificationFilter === key ? "active" : ""}
                        onClick={() => setNotificationFilter(key)}
                      >
                        {label} <span>{amount}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="notification-list">
                  {filteredNotifications.map((notification) => {
                    const category = notificationCategory(notification.message);
                    return (
                      <article
                        className={
                          notification.read_at
                            ? "notification-item"
                            : "notification-item unread"
                        }
                        key={notification.id}
                      >
                        <span className={`notification-icon ${category}`}>
                          {category === "order" ? (
                            <ReceiptIcon />
                          ) : category === "promo" ? (
                            <TicketIcon />
                          ) : (
                            <BellIcon />
                          )}
                        </span>
                        <span className="notification-copy">
                          <strong>
                            {notificationTitle(notification.message)}
                          </strong>
                          <span>{notification.message}</span>
                        </span>
                        <span className="notification-meta">
                          <small>
                            {formatDateTime(notification.created_at)}
                          </small>
                          {!notification.read_at && (
                            <span
                              className="unread-dot"
                              aria-label="Belum dibaca"
                            />
                          )}
                          {!notification.read_at && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  api("notification-read", {
                                    id: notification.id,
                                  }),
                                )
                              }
                            >
                              Tandai dibaca
                            </button>
                          )}
                        </span>
                      </article>
                    );
                  })}
                </div>
                {!filteredNotifications.length && (
                  <div className="notification-empty">
                    <BellIcon />
                    <h3>Belum ada notifikasi</h3>
                    <p>Informasi terbaru akan tampil di sini.</p>
                  </div>
                )}
              </div>
            )}
            {overlay === "support" && (
              <div className="customer-support-content">
                {supportOrder ? (
                  <section
                    className="support-order-context"
                    aria-label="Konteks pesanan"
                  >
                    <span className="section-icon">
                      <ReceiptIcon />
                    </span>
                    <div>
                      <small>PESANAN TERHUBUNG</small>
                      <strong>
                        WB{String(supportOrder.id).padStart(6, "0")}
                      </strong>
                      <span>
                        {orderStatusMeta(supportOrder.status).label} ·{" "}
                        {money(supportOrder.total)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCustomerTracking(supportOrder.id)}
                    >
                      Lihat status
                    </button>
                  </section>
                ) : (
                  <div className="support-intro">
                    <span className="section-icon">
                      <HelpIcon />
                    </span>
                    <div>
                      <strong>Ada yang bisa kami bantu?</strong>
                      <span>
                        Pilih bantuan agar tim Warkost memahami kebutuhanmu.
                      </span>
                    </div>
                  </div>
                )}
                {supportOrder && (
                  <section
                    className="support-communication-actions"
                    aria-label="Komunikasi pesanan"
                  >
                    <button
                      type="button"
                      className="support-communication-card primary-chat"
                      onClick={() =>
                        openCustomerSupport(supportOrder.id, "chat-admin")
                      }
                    >
                      <ChatIcon />
                      <span>
                        <strong>Chat dengan Admin</strong>
                        <small>
                          Tanyakan status pesanan, pembayaran, atau bantuan
                          lainnya.
                        </small>
                      </span>
                      <ArrowIcon />
                    </button>
                    <button
                      type="button"
                      className="support-communication-card"
                      disabled={!supportDriverContactEnabled}
                      onClick={() =>
                        openCustomerSupport(supportOrder.id, "chat-driver")
                      }
                    >
                      <TruckIcon />
                      <span>
                        <strong>Chat dengan Driver</strong>
                        <small>
                          {supportDriverContactEnabled
                            ? "Koordinasikan lokasi dan pengantaran dengan driver."
                            : supportDriverAssigned
                              ? "Chat aktif saat fase pengantaran berlangsung."
                              : "Driver belum ditugaskan."}
                        </small>
                      </span>
                      <ArrowIcon />
                    </button>
                  </section>
                )}
                {!supportTopic ? (
                  <>
                    <div className="support-topics" aria-label="Topik bantuan">
                      <button
                        type="button"
                        onClick={() =>
                          supportOrder
                            ? openCustomerTracking(supportOrder.id)
                            : goToCustomerOrders("all")
                        }
                      >
                        <ReceiptIcon />
                        <span>
                          <strong>Pesanan</strong>
                          <small>Cek proses dan estimasi pesanan</small>
                        </span>
                        <ArrowIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupportTopic("payment")}
                      >
                        <WalletIcon />
                        <span>
                          <strong>Pembayaran</strong>
                          <small>Bantuan pembayaran atau tagihan</small>
                        </span>
                        <ArrowIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupportTopic("delivery")}
                      >
                        <TruckIcon />
                        <span>
                          <strong>Pengiriman &amp; Ongkir</strong>
                          <small>
                            Alamat, ongkir, keterlambatan, atau driver
                          </small>
                        </span>
                        <ArrowIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupportTopic("voucher")}
                      >
                        <TicketIcon />
                        <span>
                          <strong>Voucher &amp; Poin</strong>
                          <small>Klaim, penggunaan, dan saldo loyalty</small>
                        </span>
                        <ArrowIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupportTopic("account")}
                      >
                        <UserIcon />
                        <span>
                          <strong>Akun &amp; Alamat</strong>
                          <small>Profil, password, dan alamat tersimpan</small>
                        </span>
                        <ArrowIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupportTopic("faq")}
                      >
                        <HelpIcon />
                        <span>
                          <strong>FAQ</strong>
                          <small>Jawaban cepat pertanyaan umum</small>
                        </span>
                        <ArrowIcon />
                      </button>
                    </div>
                    <button
                      className="primary support-admin-action"
                      type="button"
                      disabled={!supportOrder}
                      onClick={() =>
                        supportOrder &&
                        openCustomerSupport(supportOrder.id, "chat-admin")
                      }
                    >
                      <ChatIcon /> Chat dengan Admin
                    </button>
                  </>
                ) : (
                  <section
                    className="support-topic-detail"
                    aria-label={
                      supportTopic === "payment"
                        ? "Bantuan pembayaran"
                        : supportTopic === "delivery"
                          ? "Bantuan pengantaran"
                          : supportTopic === "driver"
                            ? "Customer dan Driver"
                            : supportTopic === "voucher"
                              ? "Bantuan voucher dan poin"
                              : supportTopic === "account"
                                ? "Bantuan akun dan alamat"
                                : supportTopic === "faq"
                                  ? "FAQ"
                                  : "Bantuan Admin"
                    }
                  >
                    <button
                      className="support-back"
                      type="button"
                      onClick={() => setSupportTopic(null)}
                    >
                      <ArrowIcon /> Kembali ke topik bantuan
                    </button>
                    {supportTopic === "payment" && (
                      <>
                        <div className="support-detail-heading">
                          <WalletIcon />
                          <div>
                            <strong>Bantuan pembayaran</strong>
                            <span>
                              Informasi pembayaran dari data pesanan yang
                              tersedia.
                            </span>
                          </div>
                        </div>
                        {supportOrder ? (
                          <div className="support-fact-list">
                            <div>
                              <span>Nomor pesanan</span>
                              <strong>
                                WB{String(supportOrder.id).padStart(6, "0")}
                              </strong>
                            </div>
                            <div>
                              <span>Status pembayaran</span>
                              <strong>
                                {supportOrder.payment_status ||
                                  "Belum tersedia"}
                              </strong>
                            </div>
                            <div>
                              <span>Total</span>
                              <strong>{money(supportOrder.total)}</strong>
                            </div>
                          </div>
                        ) : (
                          <p className="support-empty-copy">
                            Belum ada pesanan aktif. Buka daftar Pesanan untuk
                            memilih transaksi yang memerlukan bantuan.
                          </p>
                        )}
                        <button
                          className="button-link support-wide-action"
                          type="button"
                          onClick={() => goToCustomerOrders("all")}
                        >
                          <ReceiptIcon /> Buka Pesanan
                        </button>
                      </>
                    )}
                    {supportTopic === "delivery" && (
                      <>
                        <div className="support-detail-heading">
                          <TruckIcon />
                          <div>
                            <strong>Bantuan pengantaran</strong>
                            <span>
                              Status driver mengikuti data pengantaran pesanan.
                            </span>
                          </div>
                        </div>
                        {supportOrder ? (
                          <div className="support-fact-list">
                            <div>
                              <span>Nomor pesanan</span>
                              <strong>
                                WB{String(supportOrder.id).padStart(6, "0")}
                              </strong>
                            </div>
                            <div>
                              <span>Status pesanan</span>
                              <strong>
                                {orderStatusMeta(supportOrder.status).label}
                              </strong>
                            </div>
                            <div>
                              <span>Driver</span>
                              <strong>
                                {supportDriverAssigned
                                  ? "Sudah ditugaskan"
                                  : "Belum ditugaskan"}
                              </strong>
                            </div>
                          </div>
                        ) : (
                          <p className="support-empty-copy">
                            Belum ada pesanan aktif untuk bantuan pengantaran.
                          </p>
                        )}
                        <button
                          className="primary support-wide-action"
                          type="button"
                          disabled={!supportDriverContactEnabled}
                          onClick={() =>
                            supportOrder &&
                            openCustomerSupport(
                              supportOrder.id,
                              "chat-driver",
                            )
                          }
                        >
                          <ChatIcon /> Chat dengan Driver
                        </button>
                        {!supportDriverContactEnabled && (
                          <small className="support-disabled-note">
                            {supportDriverAssigned
                              ? "Driver belum memulai fase pengantaran yang dapat dihubungi."
                              : "Driver belum ditugaskan untuk pesanan ini."}
                          </small>
                        )}
                      </>
                    )}
                    {supportTopic === "driver" && (
                      <>
                        <div className="support-detail-heading">
                          <ChatIcon />
                          <div>
                            <strong>Customer ↔ Driver</strong>
                            <span>
                              Konteks pengantaran terhubung ke pesanan aktif.
                            </span>
                          </div>
                        </div>
                        <div className="support-fact-list">
                          <div>
                            <span>Nomor pesanan</span>
                            <strong>
                              WB{String(supportOrder.id).padStart(6, "0")}
                            </strong>
                          </div>
                          <div>
                            <span>Status</span>
                            <strong>
                              {orderStatusMeta(supportOrder.status).label}
                            </strong>
                          </div>
                          <div>
                            <span>Alamat</span>
                            <strong>
                              {supportOrder.address_label ||
                                "Alamat pengantaran"}
                            </strong>
                          </div>
                        </div>
                        <p className="support-empty-copy">
                          Gunakan jalur ini hanya untuk koordinasi pengantaran
                          pesanan dengan driver yang ditugaskan.
                        </p>
                      </>
                    )}
                    {supportTopic === "voucher" && (
                      <>
                        <div className="support-detail-heading">
                          <TicketIcon />
                          <div>
                            <strong>Voucher &amp; Poin</strong>
                            <span>
                              Voucher dan loyalty mengikuti kelayakan akun dan
                              pesananmu.
                            </span>
                          </div>
                        </div>
                        <p className="support-empty-copy">
                          Buka Voucher &amp; Loyalty dari Akun untuk melihat
                          voucher yang diklaim, saldo poin, dan reward yang
                          tersedia.
                        </p>
                        <button
                          className="button-link support-wide-action"
                          type="button"
                          onClick={() => openAccountSection("account-loyalty")}
                        >
                          <TicketIcon /> Buka Voucher &amp; Loyalty
                        </button>
                      </>
                    )}
                    {supportTopic === "account" && (
                      <>
                        <div className="support-detail-heading">
                          <UserIcon />
                          <div>
                            <strong>Akun &amp; Alamat</strong>
                            <span>
                              Kelola profil, password, dan alamat tersimpan.
                            </span>
                          </div>
                        </div>
                        <p className="support-empty-copy">
                          Data akun hanya dapat diakses oleh sesi pelanggan yang
                          sedang login. Koordinat alamat tidak ditampilkan
                          sebagai input teknis.
                        </p>
                        <button
                          className="button-link support-wide-action"
                          type="button"
                          onClick={() => openAccountSection("account-settings")}
                        >
                          <UserIcon /> Buka Pengaturan Akun
                        </button>
                      </>
                    )}
                    {supportTopic === "faq" && (
                      <>
                        <div className="support-detail-heading">
                          <HelpIcon />
                          <div>
                            <strong>FAQ</strong>
                            <span>Informasi umum layanan Warkost.</span>
                          </div>
                        </div>
                        <div className="support-fact-list">
                          <div>
                            <span>Kapan ongkir gratis?</span>
                            <strong>Hingga radius 5 km</strong>
                          </div>
                          <div>
                            <span>Bisakah voucher dan poin digabung?</span>
                            <strong>Tidak pada versi saat ini</strong>
                          </div>
                          <div>
                            <span>Kapan driver dapat dihubungi?</span>
                            <strong>Saat sudah ditugaskan dan mengantar</strong>
                          </div>
                        </div>
                      </>
                    )}
                    {supportTopic === "admin" && (
                      <>
                        <div className="support-detail-heading">
                          <ChatIcon />
                          <div>
                            <strong>Customer Support Admin</strong>
                            <span>
                              Bantuan internal Warkost dengan konteks pesanan.
                            </span>
                          </div>
                        </div>
                        {supportOrder ? (
                          <div className="support-fact-list">
                            <div>
                              <span>Nomor pesanan</span>
                              <strong>
                                WB{String(supportOrder.id).padStart(6, "0")}
                              </strong>
                            </div>
                            <div>
                              <span>Status pesanan</span>
                              <strong>
                                {orderStatusMeta(supportOrder.status).label}
                              </strong>
                            </div>
                            <div>
                              <span>Status pembayaran</span>
                              <strong>
                                {supportOrder.payment_status ||
                                  "Belum tersedia"}
                              </strong>
                            </div>
                            <div>
                              <span>Total</span>
                              <strong>{money(supportOrder.total)}</strong>
                            </div>
                          </div>
                        ) : (
                          <p className="support-empty-copy">
                            Sampaikan kebutuhan umum melalui pusat bantuan.
                            Pilih pesanan terlebih dahulu bila bantuan terkait
                            transaksi tertentu.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}
                <div className="support-fallback">
                  <strong>Kontak umum</strong>
                  <p>
                    Untuk kebutuhan umum di luar pesanan, WhatsApp tetap
                    tersedia sebagai fallback.
                  </p>
                  <a
                    className="button-link"
                    href={whatsappLink(
                      settings.businessWhatsApp,
                      "Halo Warkost Bahagia, saya membutuhkan bantuan umum.",
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ChatIcon /> WhatsApp umum
                  </a>
                </div>
              </div>
            )}
            {overlay === "account" && (
              <div className="quick-account-menu">
                <button onClick={() => goToCustomerOrders("all")}>
                  <ReceiptIcon />
                  <span>Pesanan Aktif</span>
                </button>
                <button onClick={() => goToCustomerOrders("history")}>
                  <HistoryIcon />
                  <span>Riwayat</span>
                </button>
                <button onClick={() => goToCustomerOrders("tracking")}>
                  <LocationIcon />
                  <span>Tracking</span>
                </button>
                <button onClick={() => openAccountSection("account-loyalty")}>
                  <TicketIcon />
                  <span>Voucher &amp; Loyalty</span>
                </button>
                <button onClick={() => openAccountSection("account-address")}>
                  <LocationIcon />
                  <span>Alamat</span>
                </button>
                <button onClick={() => openAccountSection("account-settings")}>
                  <UserIcon />
                  <span>Pengaturan Akun</span>
                </button>
                <button onClick={openCustomerHelp}>
                  <HelpIcon />
                  <span>Bantuan</span>
                </button>
                <button className="danger-text" onClick={logout}>
                  <LogoutIcon />
                  <span>Keluar</span>
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {chatTarget && ["CUSTOMER", "DRIVER"].includes(role) && (
        <ConversationChat
          target={chatTarget}
          viewerRole={role}
          onClose={() => setChatTarget(null)}
        />
      )}
      {role === "ADMIN" && <AdminUiRuntime view={view} />}
      <footer>
        Warkost Bahagia · Dibuat untuk operasional yang lebih rapi
      </footer>
    </>
  );
}

function AdminUiRuntime({ view }) {
  return (
    <>
      <AdminUiEnhancer view={view} />
      <AdminNotificationPopover key={`admin-notifications-${view}`} />
      {view === "orders" && (
        <>
          <AdminOrderCardEnhancer />
          <AdminOrderModalEnhancer />
        </>
      )}
      {view === "customers" && (
        <>
          <AdminCustomersEnhancer />
          <AdminCustomerService />
        </>
      )}
      {view === "admin-stock" && (
        <>
          <AdminBeverageStockEnhancerV2 />
          <AdminBeverageStockPolish />
        </>
      )}
      {view === "printing" && <AdminPrinterController />}
    </>
  );
}
function AdminNavIcon({ name }) {
  const paths = {
    home: (
      <>
        <path d="M3 11 12 4l9 7" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M17 15a5 5 0 0 1 4 5" />
      </>
    ),
    box: (
      <>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
        <path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" />
      </>
    ),
    printer: (
      <>
        <path d="M7 8V3h10v5" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-2" />
        <path d="M7 14h10v7H7zM18 11h.01" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" />
      </>
    ),
  };
  return (
    <SvgIcon className="admin-svg-icon admin-nav-icon">{paths[name]}</SvgIcon>
  );
}
function SvgIcon({ children, className = "ui-icon" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
function BellIcon() {
  return (
    <SvgIcon>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </SvgIcon>
  );
}
function CartIcon() {
  return (
    <SvgIcon>
      <path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </SvgIcon>
  );
}
function UserIcon() {
  return (
    <SvgIcon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </SvgIcon>
  );
}
function HelpIcon() {
  return (
    <SvgIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.4 1-1.4 2.1" />
      <path d="M12 17h.01" />
    </SvgIcon>
  );
}
function SearchIcon() {
  return (
    <SvgIcon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </SvgIcon>
  );
}
function ArrowIcon() {
  return (
    <SvgIcon>
      <path d="m9 18 6-6-6-6" />
    </SvgIcon>
  );
}
function TruckIcon() {
  return (
    <SvgIcon>
      <path d="M3 6h10v10H3zM13 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </SvgIcon>
  );
}
function FoodIcon() {
  return (
    <SvgIcon>
      <path d="M6 3v8M3 3v5c0 2 1 3 3 3s3-1 3-3V3M6 11v10" />
      <path d="M15 3v18M15 3c4 1 5 5 5 8h-5" />
    </SvgIcon>
  );
}
function BowlIcon() {
  return (
    <SvgIcon>
      <path d="M4 11h16a8 8 0 0 1-16 0ZM7 19h10" />
      <path d="M8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4" />
    </SvgIcon>
  );
}
function DrinkIcon() {
  return (
    <SvgIcon>
      <path d="M7 8h10l-1 13H8L7 8ZM9 4h8M15 4l-2 5" />
    </SvgIcon>
  );
}
function ShieldIcon() {
  return (
    <SvgIcon>
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </SvgIcon>
  );
}
function ChatIcon() {
  return (
    <SvgIcon>
      <path d="M21 12a8 8 0 0 1-9 8 9 9 0 0 1-4-1l-5 2 2-5a8 8 0 1 1 16-4Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </SvgIcon>
  );
}
function PhoneIcon() {
  return (
    <SvgIcon>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z" />
    </SvgIcon>
  );
}
function ReceiptIcon() {
  return (
    <SvgIcon>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </SvgIcon>
  );
}
function HistoryIcon() {
  return (
    <SvgIcon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </SvgIcon>
  );
}
function LocationIcon() {
  return (
    <SvgIcon>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </SvgIcon>
  );
}
function LogoutIcon() {
  return (
    <SvgIcon>
      <path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6" />
    </SvgIcon>
  );
}
function StarIcon() {
  return (
    <SvgIcon>
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
    </SvgIcon>
  );
}
function TicketIcon() {
  return (
    <SvgIcon>
      <path d="M3 7a2 2 0 0 0 0 4v6h18v-6a2 2 0 0 0 0-4V5H3v2Z" />
      <path d="M13 5v12M8 9h.01M8 13h.01" />
    </SvgIcon>
  );
}
function WalletIcon() {
  return (
    <SvgIcon>
      <path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h13" />
      <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
    </SvgIcon>
  );
}
function CheckIcon() {
  return (
    <SvgIcon>
      <path d="m5 12 4 4L19 6" />
    </SvgIcon>
  );
}
function OrderProgress({ status, compact = false }) {
  const activeStage = orderStage(status);
  if (status === "CANCELLED") return null;
  return (
    <div
      className={`order-progress ${compact ? "compact" : ""}`}
      aria-label={`Progress pesanan: ${orderStatusMeta(status).label}`}
    >
      {ORDER_STAGES.map((stage, index) => (
        <div
          className={`progress-step ${index <= activeStage ? "complete" : ""} ${index === activeStage ? "current" : ""}`}
          key={stage.key}
        >
          <span>{index < activeStage ? <CheckIcon /> : index + 1}</span>
          <small>{stage.label}</small>
        </div>
      ))}
    </div>
  );
}
function CustomerTracking({ order, justCreated, onBack, onSupport }) {
  const [details, setDetails] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [payment, setPayment] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!order?.id) return;
    let active = true;
    api("order-items?id=" + order.id)
      .then((result) => active && setDetails(result))
      .catch((error) => active && setDetailError(error.message));
    return () => {
      active = false;
    };
  }, [order?.id]);
  useEffect(() => {
    if (!order?.id || order.method !== "QRIS") return;
    setPayment({
      order_id: order.id,
      method: order.method,
      status: order.payment_status,
      amount: order.payment_amount,
      provider_reference: order.provider_reference,
      transaction_reference: order.transaction_reference,
      qr_payload: order.qr_payload,
      payment_url: order.payment_url,
      expires_at: order.payment_expires_at,
    });
  }, [order]);
  useEffect(() => {
    if (order?.method !== "QRIS" || payment?.status !== "PENDING") return;
    let active = true;
    const refreshPayment = () =>
      api("payment-status?orderId=" + order.id)
        .then((result) => active && setPayment(result))
        .catch((error) => active && setPaymentError(error.message));
    const poll = setInterval(refreshPayment, 10000);
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [order?.id, order?.method, payment?.status]);
  if (!order)
    return (
      <section className="tracking-loading panel" aria-live="polite">
        <h2>Memuat status pesanan…</h2>
        <p>Data pesanan sedang disinkronkan.</p>
      </section>
    );
  const status = orderStatusMeta(order.status);
  const paymentExpiry = payment?.expires_at
    ? new Date(String(payment.expires_at).replace(" ", "T") + "Z").getTime()
    : 0;
  const paymentSeconds = Math.max(
    0,
    Math.floor((paymentExpiry - clock) / 1000),
  );
  const paymentCountdown = `${String(Math.floor(paymentSeconds / 60)).padStart(2, "0")}:${String(paymentSeconds % 60).padStart(2, "0")}`;
  return (
    <section className="customer-tracking" aria-labelledby="tracking-title">
      <div className="customer-page-title tracking-page-title">
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowIcon /> Kembali ke Pesanan
        </button>
        <h1 id="tracking-title">
          {justCreated ? "Pesanan Berhasil Dibuat!" : "Lacak Pesanan"}
        </h1>
        <p>
          {justCreated
            ? "Terima kasih sudah memesan di Warkost Bahagia."
            : "Pantau progres pesananmu secara real time."}
        </p>
      </div>
      <div className="tracking-layout">
        <div className="tracking-main">
          {justCreated && (
            <section className="success-order-banner" role="status">
              <span>
                <CheckIcon />
              </span>
              <div>
                <strong>Pesanan #{order.id} berhasil dibuat</strong>
                <small>Pesanan sedang diproses dan akan segera diantar.</small>
              </div>
            </section>
          )}
          <section className="tracking-card tracking-order-number">
            <span className="section-icon">
              <ReceiptIcon />
            </span>
            <div>
              <small>Nomor Pesanan</small>
              <strong>WB{String(order.id).padStart(6, "0")}</strong>
            </div>
            <time>{formatDateTime(order.created_at)}</time>
          </section>
          <section className="tracking-card delivery-status-card">
            <div className="tracking-card-heading">
              <span className="section-icon">
                <TruckIcon />
              </span>
              <div>
                <small>Status Pengantaran</small>
                <h2>{orderHeadline(order.status)}</h2>
              </div>
              <span className={`order-status-pill ${status.tone}`}>
                {status.label}
              </span>
            </div>
            <OrderProgress status={order.status} />
            {order.driver_delay_notice === 1 && (
              <div className="driver-delay-notice">
                <strong>Driver sedang mengantar pesanan lain</strong>
                <span>
                  Pesananmu tetap diproses. Waktu pengantaran mungkin sedikit
                  lebih lama dari biasanya.
                </span>
              </div>
            )}
            <div className="contact-actions">
              <button
                className="primary"
                type="button"
                onClick={() => onSupport(order.id, "admin")}
              >
                <ChatIcon /> Hubungi Admin
              </button>
              {order.driver_id &&
              ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(
                order.status,
              ) ? (
                <button
                  className="button-link"
                  type="button"
                  onClick={() => onSupport(order.id, "chat-driver")}
                >
                  <ChatIcon /> Chat dengan Driver
                </button>
              ) : (
                <button type="button" disabled>
                  <PhoneIcon /> Hubungi Driver{" "}
                  <small>
                    {order.driver_id
                      ? "Belum memasuki fase pengantaran"
                      : "Driver belum ditugaskan"}
                  </small>
                </button>
              )}
            </div>
          </section>
          <section className="tracking-card tracking-info-card">
            <div className="tracking-card-heading">
              <span className="section-icon">
                <LocationIcon />
              </span>
              <div>
                <small>Alamat Pengiriman</small>
                <h2>{order.address_label || "Alamat"}</h2>
              </div>
            </div>
            <p>{order.address}</p>
            <small>
              {(Number(order.distance_meters) / 1000).toFixed(1)} km dari
              Warkost
            </small>
          </section>
          <section className="tracking-card tracking-info-card">
            <div className="tracking-card-heading">
              <span className="section-icon">
                <WalletIcon />
              </span>
              <div>
                <small>Metode Pembayaran</small>
                <h2>
                  {order.method === "QRIS"
                    ? "QRIS"
                    : order.method === "BANK_TRANSFER"
                      ? "Transfer bank"
                      : "Tunai saat diterima"}
                </h2>
              </div>
            </div>
            <span
              className={`payment-status ${String(payment?.status || order.payment_status || "").toLowerCase()}`}
            >
              {payment?.status || order.payment_status}
            </span>
            {order.method === "QRIS" && payment && (
              <div className="qris-payment-panel">
                <div>
                  <span>Total tepat</span>
                  <strong>{money(payment.amount)}</strong>
                </div>
                {payment.status === "PENDING" && (
                  <div>
                    <span>Sisa waktu</span>
                    <strong>{paymentCountdown}</strong>
                  </div>
                )}
                {payment.qr_payload && payment.status === "PENDING" && (
                  <code>{payment.qr_payload}</code>
                )}
                {payment.payment_url && payment.status === "PENDING" && (
                  <a
                    className="button-link"
                    href={payment.payment_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka halaman pembayaran
                  </a>
                )}
                <p>
                  {payment.status === "PAID"
                    ? "Pembayaran berhasil diverifikasi."
                    : payment.status === "FAILED"
                      ? "Pembayaran gagal. Silakan buat pesanan baru untuk mencoba kembali."
                      : payment.status === "EXPIRED"
                        ? "Pembayaran kedaluwarsa. Silakan buat pesanan baru untuk mencoba kembali."
                        : "Menunggu konfirmasi aman dari provider pembayaran."}
                </p>
                {payment.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentError("");
                      api("payment-status?orderId=" + order.id)
                        .then(setPayment)
                        .catch((error) => setPaymentError(error.message));
                    }}
                  >
                    Periksa status pembayaran
                  </button>
                )}
                {paymentError && <small role="alert">{paymentError}</small>}
              </div>
            )}
          </section>
        </div>
        <aside className="tracking-card tracking-summary">
          <div className="checkout-card-heading">
            <span className="section-icon">
              <CartIcon />
            </span>
            <h2>Ringkasan Pesanan</h2>
          </div>
          {details?.items.map((item, index) => (
            <div className="tracking-item" key={`${item.name}-${index}`}>
              <Image
                src={demoProductImage(item.name)}
                alt=""
                width={72}
                height={56}
              />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.quantity} × {money(item.price)}
                </small>
              </span>
              <strong>{money(item.quantity * item.price)}</strong>
            </div>
          ))}
          {!details && !detailError && <p>Memuat detail menu…</p>}
          {detailError && <p role="alert">{detailError}</p>}
          <div className="tracking-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(order.subtotal)}</strong>
            </div>
            <div>
              <span>Ongkir</span>
              <strong>{money(order.delivery_fee)}</strong>
            </div>
            <div className="grand-total">
              <span>Total Pembayaran</span>
              <strong>{money(order.total)}</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
function Order({
  order: o,
  role,
  busy,
  action,
  onTrack,
  onReorder,
  onSupport,
  onChat,
}) {
  const [details, setDetails] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const adminNext = {
    PENDING: "CONFIRMED",
  };
  const driverNext = {
    ASSIGNED: "PICKED_UP",
    PICKED_UP: "ON_DELIVERY",
    ON_DELIVERY: "DELIVERED",
  };
  useEffect(() => {
    if (role !== "CUSTOMER") return;
    let active = true;
    api("order-items?id=" + o.id)
      .then((result) => active && setDetails(result))
      .catch((error) => active && setDetailError(error.message));
    return () => {
      active = false;
    };
  }, [o.id, role]);
  if (role === "CUSTOMER") {
    const status = orderStatusMeta(o.status);
    const active = !["DELIVERED", "CANCELLED"].includes(o.status);
    return (
      <article className="panel order customer-order-card">
        <span className="badge sr-only">{o.status.replaceAll("_", " ")}</span>
        <div className="customer-order-meta">
          <span className={`order-status-pill ${status.tone}`}>
            {status.label}
          </span>
          <time>{formatDateTime(o.created_at)}</time>
          <strong>
            #{o.id} · WB{String(o.id).padStart(6, "0")}
          </strong>
        </div>
        <div className="customer-order-content">
          <div className="order-item-preview">
            {(details?.items || []).slice(0, 3).map((item, index) => (
              <Image
                key={`${item.name}-${index}`}
                src={demoProductImage(item.name)}
                alt=""
                width={86}
                height={70}
              />
            ))}
            {!details && (
              <span className="order-preview-placeholder">
                <CartIcon />
              </span>
            )}
            {details && (
              <small>
                {details.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                menu
              </small>
            )}
          </div>
          <div className="order-summary-copy">
            <h2>{orderHeadline(o.status)}</h2>
            <p>
              {active
                ? "Pantau perkembangan pesananmu di bawah ini."
                : o.status === "DELIVERED"
                  ? "Terima kasih sudah memesan di Warkost Bahagia."
                  : "Pesanan ini tidak dilanjutkan."}
            </p>
            <strong>{money(o.total)}</strong>
          </div>
          <OrderProgress status={o.status} compact />
        </div>
        {o.driver_delay_notice === 1 && (
          <div className="driver-delay-notice compact">
            <strong>Driver sedang mengantar pesanan lain</strong>
            <span>
              Pesananmu tetap diproses. Waktu pengantaran mungkin sedikit lebih
              lama dari biasanya.
            </span>
          </div>
        )}
        <div className="customer-order-actions">
          <button
            aria-label="Lihat item & riwayat"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Tutup Detail" : "Lihat Detail"}
          </button>
          {active && (
            <button className="primary" onClick={() => onTrack?.(o.id)}>
              <TruckIcon /> Lacak Pesanan
            </button>
          )}
          {o.status === "DELIVERED" && (
            <button
              className="primary"
              disabled={!details}
              onClick={() => onReorder?.(details?.items)}
            >
              <HistoryIcon /> Pesan Lagi
            </button>
          )}
        </div>
        {detailError && <p role="alert">{detailError}</p>}
        {expanded && details && (
          <div className="order-details customer-order-details">
            {details.items.map((item, index) => (
              <div className="line" key={`${item.name}-${index}`}>
                <span>
                  {item.quantity} × {item.name}
                </span>
                <strong>{money(item.quantity * item.price)}</strong>
              </div>
            ))}
            <small>Riwayat status</small>
            {details.events.map((event, index) => (
              <p key={index}>
                {formatDateTime(event.created_at)} ·{" "}
                {event.next_status.replaceAll("_", " ")}
              </p>
            ))}
            <button
              className="button-link order-support-action"
              type="button"
              onClick={() => onSupport?.(o.id, "admin")}
            >
              <ChatIcon /> Hubungi Admin
            </button>
          </div>
        )}
      </article>
    );
  }
  return (
    <article className="panel order">
      <div className="order-head">
        <div>
          <small>
            #{o.id} · {o.created_at}
          </small>
          <h2>{o.customer_name || "Pesanan saya"}</h2>
        </div>
        <span className="badge">{o.status.replaceAll("_", " ")}</span>
      </div>
      <p>{o.address || ""}</p>
      <div className="line">
        <strong>{money(o.total)}</strong>
        <span>{o.payment_status || ""}</span>
      </div>
      {o.method === "CASH" && o.status === "DELIVERED" && (
        <div className="order-details cod-settlement-status">
          <strong>Setoran COD</strong>
          <span>
            {o.settlement_status === "AWAITING_COD_SETTLEMENT"
              ? "Menunggu setoran tunai driver"
              : o.settlement_status === "SUBMITTED"
                ? `Menunggu verifikasi Admin · ${money(o.cash_amount)}`
                : o.settlement_status === "NEEDS_REVIEW"
                  ? `Perlu diperbaiki · selisih ${money(Math.abs(Number(o.discrepancy_amount || 0)))}`
                  : o.settlement_status === "VERIFIED"
                    ? "Setoran tunai terverifikasi"
                    : "Menunggu data setoran"}
          </span>
        </div>
      )}
      {(o.kitchen_status || o.cashier_status) && (
        <div className="station-statuses">
          {o.kitchen_status && (
            <span className="badge">Dapur · {o.kitchen_status}</span>
          )}
          {o.cashier_status && (
            <span className="badge">Admin minuman · {o.cashier_status}</span>
          )}
        </div>
      )}
      {!(role === "DRIVER" && o.available_to_claim) && (
        <button
          onClick={() => {
            if (details) {
              setDetails(null);
              return;
            }
            api("order-items?id=" + o.id)
              .then(setDetails)
              .catch((e) => setDetailError(e.message));
          }}
        >
          {details ? "Tutup detail" : "Lihat item & riwayat"}
        </button>
      )}
      {detailError && <p role="alert">{detailError}</p>}
      {details && (
        <div className="order-details">
          {details.items.map((item, i) => (
            <div className="line" key={i}>
              <span>
                {item.quantity} × {item.name}
                {item.prep_station &&
                  ` · ${item.prep_station === "KITCHEN" ? "Dapur" : "Admin · minuman"}`}
              </span>
              <strong>{money(item.quantity * item.price)}</strong>
            </div>
          ))}
          <small>Riwayat status</small>
          {details.events.map((event, i) => (
            <p key={i}>
              {event.created_at} · {event.next_status.replaceAll("_", " ")}
            </p>
          ))}
        </div>
      )}
      {["ADMIN", "OWNER"].includes(role) && (
        <div className="actions">
          {adminNext[o.status] && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("status", { orderId: o.id, status: adminNext[o.status] })
              }
            >
              Lanjutkan ke {adminNext[o.status]}
            </button>
          )}
          {role === "ADMIN" && o.cashier_status === "QUEUED" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("station-status", { orderId: o.id, status: "PREPARING" })
              }
            >
              Mulai siapkan minuman
            </button>
          )}
          {role === "ADMIN" && o.cashier_status === "PREPARING" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("station-status", { orderId: o.id, status: "READY" })
              }
            >
              Minuman siap
            </button>
          )}
          {role === "ADMIN" &&
            o.method === "BANK_TRANSFER" &&
            ["UNPAID", "PENDING"].includes(o.payment_status) && (
              <>
                <button
                  onClick={() =>
                    action("payment", { orderId: o.id, status: "PAID" })
                  }
                  disabled={busy}
                >
                  Tandai lunas
                </button>
                <button
                  onClick={() =>
                    action("payment", { orderId: o.id, status: "FAILED" })
                  }
                  disabled={busy}
                >
                  Tandai gagal
                </button>
              </>
            )}
          {role === "ADMIN" &&
            o.method === "CASH" &&
            o.status === "DELIVERED" &&
            o.settlement_status === "SUBMITTED" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  action("cod-settlement-verify", { orderId: o.id })
                }
              >
                Verifikasi setoran COD
              </button>
            )}
        </div>
      )}
      {role === "KITCHEN" &&
        ["QUEUED", "PREPARING"].includes(o.kitchen_status) && (
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("station-status", {
                  orderId: o.id,
                  status: o.kitchen_status === "QUEUED" ? "PREPARING" : "READY",
                })
              }
            >
              {o.kitchen_status === "QUEUED" ? "Mulai masak" : "Makanan siap"}
            </button>
          </div>
        )}
      {role === "DRIVER" && driverNext[o.status] && (
        <div className="actions">
          {o.status === "ASSIGNED" && !o.accepted_at ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => action("accept", { orderId: o.id })}
            >
              Terima tugas
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("status", {
                  orderId: o.id,
                  status: driverNext[o.status],
                })
              }
            >
              {o.status === "ASSIGNED"
                ? "Sudah diambil · Pickup"
                : o.status === "PICKED_UP"
                  ? "Mulai pengantaran"
                  : "Selesaikan pengantaran"}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onChat?.("CUSTOMER_DRIVER", o.id)}
          >
            <ChatIcon /> Chat Customer
          </button>
        </div>
      )}
      {role === "DRIVER" && Boolean(o.available_to_claim) && (
        <div className="actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => action("claim-delivery", { orderId: o.id })}
          >
            Ambil Pesanan
          </button>
        </div>
      )}
    </article>
  );
}

function DriverTripControls({ orders, busy, action }) {
  const [codBatch, setCodBatch] = useState(null);
  const active = orders.filter((order) =>
    ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(order.status),
  );
  const ready = orders.filter((order) => Boolean(order.available_to_claim));
  const assigned = active.filter((order) => order.status === "ASSIGNED");
  const pickedUp = active.filter((order) => order.status === "PICKED_UP");
  const codOutstanding = orders.filter(
    (order) =>
      order.method === "CASH" &&
      order.status === "DELIVERED" &&
      order.settlement_status !== "VERIFIED",
  );
  const codAmount = codOutstanding.reduce(
    (sum, order) =>
      sum +
      Number(order.expected_amount ?? order.payment_amount ?? order.total ?? 0),
    0,
  );
  useEffect(() => {
    let active = true;
    const load = () =>
      api("cod-batch-driver")
        .then((result) => active && setCodBatch(result))
        .catch(() => active && setCodBatch(null));
    load();
    window.addEventListener("warkost:cod-batch-updated", load);
    return () => {
      active = false;
      window.removeEventListener("warkost:cod-batch-updated", load);
    };
  }, []);
  const serverCodCount = codBatch?.eligible_orders?.length;
  const serverCodAmount = codBatch?.eligible_expected_amount;
  return (
    <section
      className="panel driver-trip-workspace"
      aria-label="Kontrol trip Driver"
    >
      <div className="driver-trip-heading">
        <div>
          <small>TRIP PENGANTARAN</small>
          <h2>Kelola pesanan satu perjalanan</h2>
          <p>
            Ambil dan pickup bersama, lalu selesaikan setiap alamat satu per
            satu.
          </p>
        </div>
        <span>Maksimal 5 pesanan aktif</span>
      </div>
      <div className="driver-trip-stats">
        <div>
          <small>Tugas aktif</small>
          <strong>{active.length} / 5</strong>
        </div>
        <div>
          <small>Siap diambil</small>
          <strong>{ready.length}</strong>
        </div>
        <div>
          <small>Sudah di-pickup</small>
          <strong>{pickedUp.length}</strong>
        </div>
        <div>
          <small>COD belum setor</small>
          <strong>{money(serverCodAmount ?? codAmount)}</strong>
        </div>
      </div>
      <div className="actions driver-trip-actions">
        {ready.length > 0 && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => action("claim-all-deliveries")}
          >
            Ambil Semua Pesanan
          </button>
        )}
        {assigned.length > 0 && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => action("pickup-all-deliveries")}
          >
            Pickup Semua
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            window.dispatchEvent(new CustomEvent("warkost:open-cod-batch"))
          }
        >
          Setoran COD
          {(serverCodCount ?? codOutstanding.length)
            ? ` (${serverCodCount ?? codOutstanding.length})`
            : ""}
        </button>
      </div>
    </section>
  );
}

function LoyaltyRuleEditor({ rule, busy, onSave }) {
  return (
    <form
      className="promo-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave({
          ...(rule ? { id: rule.id } : {}),
          name: form.get("name"),
          pointsRequired: Number(form.get("pointsRequired")),
          rewardType: form.get("rewardType"),
          rewardValue: Number(form.get("rewardValue")),
          minimumOrder: Number(form.get("minimumOrder")),
          maximumDiscount: form.get("maximumDiscount"),
          active: form.get("active") === "on",
        });
      }}
    >
      {rule && (
        <div className="line">
          <strong>{rule.name}</strong>
          <span className="badge">{rule.active ? "ACTIVE" : "INACTIVE"}</span>
        </div>
      )}
      <label>
        Nama reward
        <input
          name="name"
          minLength="2"
          maxLength="100"
          defaultValue={rule?.name || ""}
          required
        />
      </label>
      <div className="columns compact-columns">
        <label>
          Poin dibutuhkan
          <input
            name="pointsRequired"
            type="number"
            min="1"
            defaultValue={rule?.points_required || 1}
            required
          />
        </label>
        <label>
          Tipe reward
          <select
            name="rewardType"
            defaultValue={rule?.reward_type || "PERCENT"}
          >
            <option value="PERCENT">Persen</option>
            <option value="FIXED">Nominal tetap</option>
          </select>
        </label>
      </div>
      <div className="columns compact-columns">
        <label>
          Nilai reward
          <input
            name="rewardValue"
            type="number"
            min="1"
            defaultValue={rule?.reward_value || 1}
            required
          />
        </label>
        <label>
          Minimum belanja
          <input
            name="minimumOrder"
            type="number"
            min="0"
            defaultValue={rule?.minimum_order || 0}
            required
          />
        </label>
      </div>
      <label>
        Maksimum diskon (opsional)
        <input
          name="maximumDiscount"
          type="number"
          min="0"
          defaultValue={rule?.maximum_discount ?? ""}
        />
      </label>
      <label className="checkbox">
        <input
          name="active"
          type="checkbox"
          defaultChecked={rule ? rule.active : true}
        />
        Aktifkan reward
      </label>
      <button className="primary" disabled={busy}>
        {rule ? "Simpan reward" : "Buat reward"}
      </button>
    </form>
  );
}

function PromotionEditor({ promotion, busy, onSave }) {
  const defaultEnd = localDateTime(Date.now() + 30 * 86400000);
  return (
    <form
      className="promo-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave({
          ...(promotion ? { id: promotion.id } : {}),
          title: form.get("title"),
          description: form.get("description"),
          badge: form.get("badge"),
          terms: form.get("terms"),
          ctaLabel: form.get("ctaLabel"),
          imageUrl: form.get("imageUrl"),
          startsAt: new Date(form.get("startsAt")).toISOString(),
          endsAt: new Date(form.get("endsAt")).toISOString(),
          active: form.get("active") === "on",
          voucherType: form.get("voucherType") || null,
          discountValue: Number(form.get("discountValue") || 0),
          minimumOrder: Number(form.get("minimumOrder") || 0),
          maxDiscount: form.get("maxDiscount"),
          quota: form.get("quota"),
        });
      }}
    >
      {promotion && (
        <div className="line">
          <strong>{promotion.title}</strong>
          <span className="badge">{promotion.status}</span>
        </div>
      )}
      <label>
        Judul promo
        <input
          name="title"
          defaultValue={promotion?.title || ""}
          minLength="2"
          maxLength="100"
          required
        />
      </label>
      <label>
        Deskripsi
        <textarea
          name="description"
          defaultValue={promotion?.description || ""}
          minLength="5"
          maxLength="500"
          required
        />
      </label>
      <div className="columns compact-columns">
        <label>
          Badge
          <input
            name="badge"
            defaultValue={promotion?.badge || "PROMO BERLANGSUNG"}
            minLength="2"
            maxLength="40"
            required
          />
        </label>
        <label>
          Teks tombol
          <input
            name="ctaLabel"
            defaultValue={promotion?.cta_label || "Pilih Menu"}
            minLength="2"
            maxLength="40"
            required
          />
        </label>
      </div>
      <label>
        Syarat promo
        <textarea
          name="terms"
          defaultValue={promotion?.terms || ""}
          minLength="3"
          maxLength="300"
          required
        />
      </label>
      <label>
        URL gambar HTTPS atau media internal (opsional)
        <input
          name="imageUrl"
          defaultValue={promotion?.image_url || ""}
          placeholder="https://..."
        />
      </label>
      <div className="columns compact-columns">
        <label>
          Mulai
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={localDateTime(promotion?.starts_at)}
            required
          />
        </label>
        <label>
          Selesai
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={
              promotion ? localDateTime(promotion.ends_at) : defaultEnd
            }
            required
          />
        </label>
      </div>
      <div className="columns compact-columns">
        <label>
          Tipe voucher (opsional)
          <select
            name="voucherType"
            defaultValue={promotion?.voucher_type || ""}
          >
            <option value="">Campaign tanpa voucher</option>
            <option value="PERCENT">Persen</option>
            <option value="FIXED">Nominal tetap</option>
          </select>
        </label>
        <label>
          Nilai diskon
          <input
            name="discountValue"
            type="number"
            min="0"
            defaultValue={promotion?.discount_value || 0}
          />
        </label>
      </div>
      <div className="columns compact-columns">
        <label>
          Minimum belanja
          <input
            name="minimumOrder"
            type="number"
            min="0"
            defaultValue={promotion?.minimum_order || 0}
          />
        </label>
        <label>
          Maksimum diskon (opsional)
          <input
            name="maxDiscount"
            type="number"
            min="0"
            defaultValue={promotion?.max_discount ?? ""}
          />
        </label>
      </div>
      <label>
        Kuota penggunaan global (opsional)
        <input
          name="quota"
          type="number"
          min="0"
          defaultValue={promotion?.quota ?? ""}
        />
      </label>
      <label className="checkbox">
        <input
          name="active"
          type="checkbox"
          defaultChecked={promotion ? promotion.active === 1 : true}
        />
        Aktifkan promo
      </label>
      <button className="primary" disabled={busy}>
        {promotion ? "Simpan promo" : "Buat promo"}
      </button>
    </form>
  );
}

function ProductEditor({ product: p, categories, busy, onSave }) {
  return (
    <form
      className="product-editor"
      key={p?.id || "new"}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave(
          {
            ...(p ? { id: p.id } : {}),
            name: f.get("name"),
            description: f.get("description"),
            price: Number(f.get("price")),
            categoryId: Number(f.get("categoryId")),
            imageUrl: f.get("imageUrl"),
            prepStation: f.get("prepStation"),
            active: f.get("active") === "on",
          },
          f.get("image"),
        );
      }}
    >
      <label>
        Nama
        <input
          name="name"
          defaultValue={p?.name || ""}
          required
          minLength="2"
        />
      </label>
      <label>
        Deskripsi
        <input name="description" defaultValue={p?.description || ""} />
      </label>
      <label>
        Harga (Rp)
        <input
          name="price"
          type="number"
          min="1"
          defaultValue={p?.price || ""}
          required
        />
      </label>
      <label>
        Kategori
        <select
          name="categoryId"
          defaultValue={p?.category_id || categories[0]?.id}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stasiun persiapan
        <select name="prepStation" defaultValue={p?.prep_station || "KITCHEN"}>
          <option value="KITCHEN">Dapur · makanan</option>
          <option value="CASHIER">Admin · minuman</option>
        </select>
      </label>
      <label>
        URL gambar HTTPS atau unggahan (opsional)
        <input
          name="imageUrl"
          type="text"
          defaultValue={p?.image_url || ""}
          placeholder="https://..."
        />
      </label>
      <label>
        Unggah gambar menu (maksimal 8 MB)
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
        />
      </label>
      <label className="checkbox">
        <input
          name="active"
          type="checkbox"
          defaultChecked={p ? p.active === 1 : true}
        />
        Tersedia untuk customer
      </label>
      <button className="primary" disabled={busy}>
        {p ? "Simpan " + p.name : "Tambah produk"}
      </button>
    </form>
  );
}
