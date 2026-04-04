const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two WGS84 points (Haversine), in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function hasValidCoordinates(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export type GeoSortableLocation = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Sort locations by distance from a reference point (nearest first).
 * Rows without valid coordinates are placed last (sorted by name).
 */
export function sortLocationsByDistanceKm<T extends GeoSortableLocation>(
  rows: T[],
  refLat: number,
  refLon: number,
): T[] {
  const withCoord = rows.filter((r) => hasValidCoordinates(r.latitude, r.longitude));
  const without = rows.filter((r) => !hasValidCoordinates(r.latitude, r.longitude));

  const sorted = [...withCoord].sort((a, b) => {
    const da = haversineDistanceKm(refLat, refLon, a.latitude!, a.longitude!);
    const db = haversineDistanceKm(refLat, refLon, b.latitude!, b.longitude!);
    return da - db;
  });

  const tail = [...without].sort((a, b) =>
    a.name.localeCompare(b.name, "pl", { sensitivity: "base" }),
  );

  return [...sorted, ...tail];
}
