export function CatalogIcon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "all" ? (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </>
      ) : name === "Bahan Baku" ? (
        <>
          <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
          <path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21m-4-16 8 4.5" />
        </>
      ) : name === "Minuman" ? (
        <>
          <path d="M7 8h10l-1 13H8L7 8ZM9 4h8M15 4l-2 5" />
        </>
      ) : (
        <>
          <path d="M4 12h16a8 8 0 0 1-16 0ZM7 20h10M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4" />
        </>
      )}
    </svg>
  );
}
