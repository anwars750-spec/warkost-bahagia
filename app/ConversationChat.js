"use client";

import { useEffect, useRef, useState } from "react";
import {
  orderStatusLabel,
  paymentGuidance,
  paymentMethodLabel,
  paymentStatusLabel,
} from "./conversationDisplay.mjs";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const timeLabel = (value) => {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

const BackIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const ChatIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M7 18l-4 3v-5.5A8 8 0 0 1 3 4h12a6 6 0 0 1 6 6v1a7 7 0 0 1-7 7H7Z" />
    <path d="M8 10h.01M12 10h.01M16 10h.01" />
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
    throw new Error(data.error || "Percakapan belum dapat dimuat");
  return data;
}

export default function ConversationChat({ target, viewerRole, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  const isDriverChat = target?.type === "CUSTOMER_DRIVER";
  const prompts = isDriverChat
    ? [
        "Saya sudah di lokasi",
        "Patokan rumah saya...",
        "Mohon hubungi saat sudah dekat",
      ]
    : [
        "Pesanan saya sampai mana?",
        "Saya ingin konfirmasi pembayaran",
        "Ada kendala pengantaran",
      ];

  useEffect(() => {
    if (!target) return;
    let active = true;
    let timer;
    setLoading(true);
    setError("");
    request("chat-open", target)
      .then((result) => {
        if (!active) return;
        setConversation(result);
        setLoading(false);
        timer = window.setInterval(() => {
          request(`chat?conversationId=${result.id}`)
            .then((latest) => active && setConversation(latest))
            .catch((pollError) => active && setError(pollError.message));
        }, 3500);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message);
        setLoading(false);
      });
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [target?.type, target?.orderId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [conversation?.messages?.length]);

  const send = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !conversation?.can_send || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await request("chat-message", {
        conversationId: conversation.id,
        message,
      });
      setConversation(result.conversation);
      setDraft("");
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  };

  const title = isDriverChat
    ? conversation?.driver?.name || "Driver Warkost"
    : "Admin Warkost";

  return (
    <div className="conversation-backdrop" role="presentation">
      <section
        className="conversation-screen"
        role="dialog"
        aria-modal="true"
        aria-label={isDriverChat ? "Chat dengan Driver" : "Chat dengan Admin"}
      >
        <header className="conversation-header">
          <button
            className="conversation-header-action"
            type="button"
            onClick={onClose}
            aria-label="Kembali"
          >
            <BackIcon />
          </button>
          <div className="conversation-avatar">
            {isDriverChat ? "DR" : "AD"}
          </div>
          <div className="conversation-identity">
            <strong>{title}</strong>
            <span>
              {isDriverChat ? "Koordinasi pengantaran" : "Customer Support"}
              {conversation?.order?.display_number
                ? ` - ${conversation.order.display_number}`
                : ""}
            </span>
          </div>
          <button
            className="conversation-header-action"
            type="button"
            onClick={onClose}
            aria-label="Tutup"
          >
            <CloseIcon />
          </button>
        </header>

        {conversation?.order && (
          <div className="conversation-order-context">
            <div>
              <small>PESANAN</small>
              <strong>{conversation.order.display_number}</strong>
            </div>
            <div>
              <small>STATUS</small>
              <strong>{orderStatusLabel(conversation.order.status)}</strong>
            </div>
            <div className="conversation-payment-fact">
              <small>METODE BAYAR</small>
              <strong>
                {paymentMethodLabel(conversation.order.payment_method)}
              </strong>
              <span
                className={`conversation-payment-status payment-${String(
                  conversation.order.payment_status || "unknown",
                ).toLowerCase()}`}
              >
                {paymentStatusLabel(conversation.order.payment_status)}
              </span>
              <em>
                {paymentGuidance(
                  conversation.order.payment_method,
                  conversation.order.payment_status,
                )}
              </em>
            </div>
            <div>
              <small>TOTAL</small>
              <strong>{money(conversation.order.total)}</strong>
            </div>
          </div>
        )}

        <div className="conversation-messages" aria-live="polite">
          {loading && <p className="conversation-state">Memuat percakapan...</p>}
          {!loading && !conversation?.messages?.length && !error && (
            <div className="conversation-empty">
              <span className="conversation-empty-icon">
                <ChatIcon />
              </span>
              <strong>Belum ada pesan</strong>
              <p>Mulai percakapan terkait pesanan ini.</p>
            </div>
          )}
          {conversation?.messages?.map((message) => {
            const own = message.sender_role === viewerRole;
            return (
              <article
                className={`conversation-bubble ${own ? "own" : "other"}`}
                key={message.id}
              >
                <small>{own ? "Anda" : message.sender_name}</small>
                <p>{message.message}</p>
                <time>{timeLabel(message.created_at)}</time>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>

        {error && <p className="conversation-error">{error}</p>}
        {conversation?.can_send && (
          <div className="conversation-prompts">
            {prompts.map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={() => setDraft(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <form className="conversation-composer" onSubmit={send}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength="1000"
            placeholder={
              conversation?.can_send
                ? "Tulis pesan..."
                : "Percakapan hanya dapat dibaca"
            }
            disabled={!conversation?.can_send || sending}
            aria-label="Tulis pesan"
          />
          <button
            className="primary"
            disabled={!draft.trim() || !conversation?.can_send || sending}
          >
            {sending ? "Mengirim..." : "Kirim"}
          </button>
        </form>
      </section>
    </div>
  );
}
