import type { DistanceOrigin } from './types.ts';

export const TAMIL_NADU_ORIGINS: DistanceOrigin[] = [
  { label: 'Salem Central (Junction)', city: 'Salem', lat: 11.6643, lng: 78.1460, source: 'manual' },
  { label: 'Coimbatore (Gandhipuram)', city: 'Coimbatore', lat: 11.0183, lng: 76.9725, source: 'manual' },
  { label: 'Madurai (Periyar / Central)', city: 'Madurai', lat: 9.9252, lng: 78.1198, source: 'manual' },
  { label: 'Tiruchirappalli (Cantonment)', city: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047, source: 'manual' },
  { label: 'Chennai (Central / Egmore)', city: 'Chennai', lat: 13.0827, lng: 80.2707, source: 'manual' },
  { label: 'Erode (Town Central)', city: 'Erode', lat: 11.3410, lng: 77.7172, source: 'manual' },
];

export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function buildDirectionsUrl(lat: number, lng: number, label?: string): string {
  const dest = `${lat},${lng}`;
  const sp = new URLSearchParams({
    api: '1',
    destination: dest,
  });
  if (label) {
    sp.set('destination_place_id', '');
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
