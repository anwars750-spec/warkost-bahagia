export const GUEST_EMAIL_SUFFIX = "@guest.warkost.invalid";

export function isGuestEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .endsWith(GUEST_EMAIL_SUFFIX);
}

export function isGuestCustomer(user) {
  return Boolean(user?.isGuest || isGuestEmail(user?.email));
}
