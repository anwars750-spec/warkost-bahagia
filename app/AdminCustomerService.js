"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  orderStatusLabel,
  paymentGuidance,
  paymentMethodLabel,
  paymentStatusLabel,
} from "./conversationDisplay.mjs";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const dateTime = (value) => {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const initials = (name) =>
  String(name || "CS")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();

const conversationStatusLabel = (status) =>
  ({ OPEN: "BARU", HANDLED: "AKTIF", CLOSED: "SELESAI" })[
    String(status || "").toUpperCase()
  ] || "AKTIF";

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const BackIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

const SearchIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <path d="m16 16 5 5" />
  </svg>
);

async function request(route, body) {
  const response = await fetch(`/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Customer Service gagal dimuat");
  return data;
}

export default function AdminCustomerService() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [inbox, setInbox] = useState({ conversations: [], totals: {} });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobileScreen, setMobileScreen] = useState("inbox");
  const endRef = useRef(null);

  const loadInbox = useCallback(async () => {
    const result = await request(
      `chat-inbox?filter=${filter}&q=${encodeURIComponent(query.trim())}`,
    );
    setInbox(result);
    setSelectedId((current) => {
      if (current && result.conversations.some((item) => item.id === current))
        return current;
      return null;
    });
  }, [filter, query]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    const result = await request(`chat?conversationId=${id}`);
    setDetail(result);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      setOpen(true);
      setMobileScreen("inbox");
      const requestedCustomerId = Number(event.detail?.customerId || 0);
      if (requestedCustomerId)
        setQuery(String(event.detail?.customerName || ""));
    };
    window.addEventListener("warkost:open-admin-customer-service", handler);
    return () =>
      window.removeEventListener(
        "warkost:open-admin-customer-service",
        handler,
      );
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let timer;
    const refresh = async () => {
      try {
        const result = await request(
          `chat-inbox?filter=${filter}&q=${encodeURIComponent(query.trim())}`,
        );
        if (active) setInbox(result);
        if (selectedId) {
          const conversation = await request(
            `chat?conversationId=${selectedId}`,
          );
          if (active) setDetail(conversation);
        }
        if (active) setError("");
      } catch (refreshError) {
        if (active) setError(refreshError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    const delay = window.setTimeout(
      () => {
        refresh();
        timer = window.setInterval(refresh, 4000);
      },
      query ? 250 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(delay);
      if (timer) window.clearInterval(timer);
    };
  }, [open, filter, query, selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [detail?.messages?.length]);

  const chooseConversation = async (id) => {
    setSelectedId(id);
    setMobileScreen("conversation");
    setError("");
    try {
      await loadDetail(id);
      await loadInbox();
    } catch (selectError) {
      setError(selectError.message);
    }
  };

  const send = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !detail?.can_send || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request("chat-message", {
        conversationId: detail.id,
        message,
      });
      setDetail(result.conversation);
      setDraft("");
      await loadInbox();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await request("chat-status", {
        conversationId: detail.id,
        status,
      });
      setDetail(updated);
      await loadInbox();
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="admin-service-backdrop">
      <section
        className={`admin-service-center ${mobileScreen === "conversation" ? "mobile-conversation" : "mobile-inbox"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Customer Service Admin"
      >
        <header className="admin-service-global-head">
          <div>
            <small>CUSTOMER SERVICE</small>
            <h2>Inbox bantuan pelanggan</h2>
          </div>
          <button
            className="admin-service-close"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="admin-service-grid">
          <aside className="admin-service-inbox real-inbox">
            <div className="admin-service-panel-head">
              <div>
                <small>INBOX</small>
                <strong>Percakapan</strong>
              </div>
              <span>{inbox.totals?.unread || 0} baru</span>
            </div>
            <label className="admin-service-search">
              <span>
                <SearchIcon />
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari customer / order..."
              />
            </label>
            <div className="admin-service-filters">
              {[
                ["all", "Semua"],
                ["unread", "Baru"],
                ["active", "Aktif"],
                ["closed", "Selesai"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={filter === key ? "active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label} <span>{inbox.totals?.[key] || 0}</span>
                </button>
              ))}
            </div>
            <div className="admin-service-thread-list">
              {inbox.conversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={selectedId === conversation.id ? "active" : ""}
                  onClick={() => chooseConversation(conversation.id)}
                >
                  <span className="admin-service-avatar">
                    {initials(conversation.customer_name)}
                  </span>
                  <span>
                    <strong>{conversation.customer_name}</strong>
                    <small>{conversation.display_number}</small>
                    <p>{conversation.latest_message || "Belum ada pesan"}</p>
                  </span>
                  <span>
                    <time>{dateTime(conversation.latest_message_at)}</time>
                    {conversation.unread_count > 0 && (
                      <em>{conversation.unread_count}</em>
                    )}
                    <small
                      className={`admin-service-thread-status ${conversation.status.toLowerCase()}`}
                    >
                      {conversationStatusLabel(conversation.status)}
                    </small>
                  </span>
                </button>
              ))}
              {!loading && !inbox.conversations.length && (
                <div className="admin-service-empty-inbox">
                  <strong>Belum ada percakapan</strong>
                  <p>Chat Customer dan Admin akan muncul di sini.</p>
                </div>
              )}
            </div>
          </aside>

          <section className="admin-service-conversation real-conversation">
            {detail ? (
              <>
                <header>
                  <button
                    type="button"
                    className="admin-service-mobile-back"
                    onClick={() => setMobileScreen("inbox")}
                    aria-label="Kembali ke inbox"
                  >
                    <BackIcon />
                  </button>
                  <div className="admin-service-avatar">
                    {initials(detail.customer.name)}
                  </div>
                  <div>
                    <strong>{detail.customer.name}</strong>
                    <span>{detail.order.display_number}</span>
                  </div>
                  <span
                    className={`admin-service-status ${detail.status.toLowerCase()}`}
                  >
                    {conversationStatusLabel(detail.status)}
                  </span>
                </header>
                <div className="admin-service-message-list">
                  {detail.messages.map((message) => (
                    <article
                      key={message.id}
                      className={
                        message.sender_role === "ADMIN" ? "own" : "other"
                      }
                    >
                      <small>
                        {message.sender_role === "ADMIN"
                          ? "Admin"
                          : message.sender_name}
                      </small>
                      <p>{message.message}</p>
                      <time>{dateTime(message.created_at)}</time>
                    </article>
                  ))}
                  {!detail.messages.length && (
                    <div className="admin-service-conversation-empty">
                      <strong>Belum ada pesan</strong>
                      <p>Customer belum memulai percakapan ini.</p>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
                {error && <p className="admin-service-error">{error}</p>}
                <form onSubmit={send}>
                  <textarea
                    rows="2"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength="1000"
                    placeholder={
                      detail.can_send ? "Tulis balasan..." : "Percakapan selesai"
                    }
                    disabled={!detail.can_send || busy}
                  />
                  <button
                    className="send"
                    disabled={!draft.trim() || !detail.can_send || busy}
                  >
                    {busy ? "Mengirim..." : "Kirim"}
                  </button>
                </form>
              </>
            ) : (
              <div className="admin-service-conversation-empty">
                <strong>Pilih percakapan</strong>
                <p>Pilih customer dari inbox untuk membuka riwayat pesan.</p>
              </div>
            )}
          </section>

          <aside className="admin-service-context real-context">
            <div className="admin-service-panel-head">
              <div>
                <small>KONTEKS</small>
                <strong>Customer &amp; order</strong>
              </div>
            </div>
            {detail ? (
              <>
                <div className="admin-service-profile">
                  <div className="admin-customer-avatar big">
                    {initials(detail.customer.name)}
                  </div>
                  <strong>{detail.customer.name}</strong>
                  <span>{detail.order.display_number}</span>
                </div>
                <div className="admin-service-context-facts">
                  <div>
                    <span>Status order</span>
                    <strong>{orderStatusLabel(detail.order.status)}</strong>
                  </div>
                  <div
                    className={`admin-service-payment-fact payment-${String(
                      detail.order.payment_status || "unknown",
                    ).toLowerCase()}`}
                  >
                    <span>Pembayaran</span>
                    <strong>
                      <b>{paymentMethodLabel(detail.order.payment_method)}</b>
                      <i aria-hidden="true" />
                      <b>{paymentStatusLabel(detail.order.payment_status)}</b>
                    </strong>
                    <small>
                      {paymentGuidance(
                        detail.order.payment_method,
                        detail.order.payment_status,
                      )}
                    </small>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>{money(detail.order.total)}</strong>
                  </div>
                  <div>
                    <span>Alamat</span>
                    <strong>{detail.order.address}</strong>
                  </div>
                  <div>
                    <span>Driver</span>
                    <strong>{detail.driver?.name || "Belum ditugaskan"}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("warkost:open-admin-order-context", {
                        detail: { orderId: detail.order.id },
                      }),
                    );
                    setOpen(false);
                  }}
                >
                  Buka detail pesanan
                </button>
                <div className="admin-service-status-actions">
                  {detail.status !== "HANDLED" &&
                    detail.status !== "CLOSED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus("HANDLED")}
                      >
                        Tandai ditangani
                      </button>
                    )}
                  {detail.status !== "CLOSED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus("CLOSED")}
                    >
                      Selesaikan percakapan
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus("OPEN")}
                    >
                      Buka kembali
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="admin-service-context-empty">
                <strong>Belum ada konteks</strong>
                <p>Informasi order tampil setelah percakapan dipilih.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
