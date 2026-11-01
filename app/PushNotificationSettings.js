"use client";
import { useEffect, useRef, useState } from "react";
async function api(body) {
  const response = await fetch("/api/push", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "Notifikasi belum dapat diperbarui");
  return data;
}
function applicationKey(value) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (char) => char.charCodeAt(0),
  );
}
export default function PushNotificationSettings({ user, onOpen }) {
  const [config, setConfig] = useState(null),
    [active, setActive] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const locked = useRef(false),
    identity = useRef(user?.id);
  identity.current = user?.id;
  const supported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  useEffect(() => {
    if (
      !user ||
      !supported ||
      !["CUSTOMER", "ADMIN", "KITCHEN", "DRIVER"].includes(user.role)
    ) {
      setConfig(null);
      return;
    }
    let cancelled = false;
    setActive(false);
    setMessage("");
    api()
      .then(async (data) => {
        if (cancelled) return;
        setConfig(data);
        if (!data.enabled) return;
        // Reading an existing registration never prompts or subscribes on load.
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const state = await api({
            action: "status",
            endpoint: subscription.endpoint,
          });
          if (!cancelled) setActive(state.active);
        }
      })
      .catch(() => {
        if (!cancelled)
          setMessage("Status notifikasi belum dapat diperiksa. Coba kembali.");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, supported]);
  useEffect(() => {
    if (!user || !supported) return;
    const ended = () => {
      void navigator.serviceWorker
        .getRegistration("/")
        .then((reg) =>
          reg?.active?.postMessage({ type: "WARKOST_SESSION_ENDED" }),
        );
      setActive(false);
    };
    window.addEventListener("warkost:session-ended", ended);
    const id = Number(
      new URL(window.location.href).searchParams.get("pushOrder"),
    );
    if (Number.isSafeInteger(id) && id > 0) {
      onOpen?.(id);
      const url = new URL(window.location.href);
      url.searchParams.delete("pushOrder");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    return () => window.removeEventListener("warkost:session-ended", ended);
  }, [user?.id, supported]);
  async function toggle() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    const id = user.id;
    try {
      if (active) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        // Revoke server first; failure remains visible and can be retried.
        if (subscription) {
          await api({ action: "unsubscribe", endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        if (identity.current === id) {
          setActive(false);
          setMessage("Notifikasi dinonaktifkan.");
        }
        return;
      }
      // Must be directly within this click handler, before any awaited network.
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== "granted") {
        setMessage(
          "Izin notifikasi diblokir. Ubah izin situs di pengaturan browser untuk mengaktifkan kembali.",
        );
        return;
      }
      if (identity.current !== id) return;
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(config.publicKey),
        });
      if (identity.current !== id) {
        await subscription.unsubscribe();
        return;
      }
      try {
        await api({ action: "subscribe", subscription: subscription.toJSON() });
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }
      if (identity.current === id) {
        setActive(true);
        setMessage("Notifikasi Aktif");
      }
    } catch (error) {
      if (identity.current === id)
        setMessage(
          error.message || "Notifikasi belum dapat diaktifkan. Coba kembali.",
        );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (!user || !["CUSTOMER", "ADMIN", "KITCHEN", "DRIVER"].includes(user.role))
    return null;
  if (!supported)
    return (
      <aside className="push-settings">
        <span>
          Notifikasi perangkat belum didukung browser ini. Pada iPhone/iPad,
          gunakan aplikasi yang ditambahkan ke Layar Utama.
        </span>
      </aside>
    );
  if (!config?.enabled) return null;
  return (
    <aside className="push-settings" aria-label="Notifikasi perangkat">
      <div>
        <strong>{active ? "Notifikasi Aktif" : "Notifikasi perangkat"}</strong>
        <p>Terima kabar operasional saat aplikasi berada di latar belakang.</p>
      </div>
      <button type="button" disabled={busy} onClick={toggle}>
        {busy
          ? "Memproses…"
          : active
            ? "Nonaktifkan Notifikasi"
            : "Aktifkan Notifikasi"}
      </button>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
