import type { Coords } from './LocationPicker';

/** OpenStreetMap embed URL framing the given points, with a marker on the first one. Used by the web build. */
export function osmEmbedUrl(points: Coords[], padding = 0.01) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const bbox = [Math.min(...lngs) - padding, Math.min(...lats) - padding, Math.max(...lngs) + padding, Math.max(...lats) + padding]
    .map((n) => n.toFixed(5))
    .join(',');
  const marker = `${points[0].latitude.toFixed(5)},${points[0].longitude.toFixed(5)}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
}

/** Turn-by-turn directions in Google Maps (opens the app when installed). */
export const directionsUrl = (to: Coords) => `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}`;
