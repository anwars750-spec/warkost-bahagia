export function readAddressPoint(latitude, longitude) {
  const validType = (value) =>
    typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "");
  if (!validType(latitude) || !validType(longitude)) return null;

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lng) ||
    Math.abs(lng) > 180
  )
    return null;
  return { latitude: lat, longitude: lng };
}
