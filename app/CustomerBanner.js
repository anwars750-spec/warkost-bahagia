"use client";
import { useEffect, useRef, useState } from "react";
const AUTOPLAY_MS = 5500;
export default function CustomerBanner({ banners = [] }) {
  const items = banners.length
    ? banners
    : [{ id: "fallback", image_url: "/demo/promo-warkost.webp" }];
  const [index, setIndex] = useState(0);
  const interaction = useRef(0),
    drag = useRef(null),
    suppressClick = useRef(0);
  const [offset, setOffset] = useState(0);
  const current = index % items.length;
  const select = (next) => {
    interaction.current = Date.now();
    setIndex(next);
  };
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        !document.hidden &&
        Date.now() - interaction.current >= AUTOPLAY_MS &&
        items.length > 1
      ) {
        interaction.current = Date.now();
        setIndex((value) => (value + 1) % items.length);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [items.length]);
  function finish(event, cancelled = false) {
    const start = drag.current;
    if (!start || event.pointerId !== start.id) return;
    drag.current = null;
    setOffset(0);
    interaction.current = Date.now();
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (
      !cancelled &&
      Math.abs(dx) >= 45 &&
      Math.abs(dx) > Math.abs(dy) * 1.15
    ) {
      suppressClick.current = Date.now() + 450;
      select((current + (dx < 0 ? 1 : -1) + items.length) % items.length);
    }
  }
  return (
    <section
      className="home-banner"
      aria-label="Banner Warkost"
      data-customer-ui-owner="react"
    >
      <article
        className={`banner-card ${offset ? "is-banner-dragging" : ""}`}
        style={
          offset
            ? {
                "--banner-drag-x": `${offset * 0.32}px`,
                "--banner-drag-opacity": Math.max(
                  0.84,
                  1 - Math.abs(offset) / 900,
                ),
              }
            : undefined
        }
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            items.length < 2 ||
            event.target.closest("button")
          )
            return;
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          interaction.current = Date.now();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (
            start &&
            event.pointerId === start.id &&
            Math.abs(event.clientX - start.x) >
              Math.abs(event.clientY - start.y)
          )
            setOffset(event.clientX - start.x);
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onClick={(event) => {
          if (
            event.target.closest("button") ||
            Date.now() < suppressClick.current ||
            !window.matchMedia("(pointer: fine)").matches
          )
            return;
          select((current + 1) % items.length);
        }}
      >
        <img
          className="banner-image"
          draggable={false}
          src={items[current].image_url}
          alt={
            items[current].id === "fallback"
              ? "Pilihan menu Warkost Bahagia"
              : `Banner Warkost ${current + 1}`
          }
        />
        {banners.length > 1 && (
          <div className="banner-controls" aria-label="Kontrol banner">
            <span className="banner-dots">
              {items.map((banner, i) => (
                <button
                  key={banner.id}
                  type="button"
                  aria-label={`Tampilkan banner ${i + 1}`}
                  aria-pressed={i === current}
                  className={i === current ? "active" : ""}
                  onClick={() => select(i)}
                />
              ))}
            </span>
          </div>
        )}
      </article>
    </section>
  );
}
