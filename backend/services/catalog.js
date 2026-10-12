// Canonical service categories and cities. The app shows the same lists (home-services-app/src/constants/catalog.ts),
// so customer requests, provider profiles and commission rules always use the same ids.
const SERVICE_CATEGORIES = ['cleaning', 'plumbing', 'ac', 'electrical', 'painting', 'maintenance', 'carpentry', 'gardening'];

const CITIES = [
  'Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Al Khobar', 'Dhahran', 'Taif',
  'Tabuk', 'Abha', 'Khamis Mushait', 'Jubail', 'Yanbu', 'Najran', 'Hail',
];

const isServiceCategory = (id) => SERVICE_CATEGORIES.includes(id);

/** Returns the canonical spelling of a known city (case-insensitive), or the trimmed input for other places. */
function normalizeCity(value) {
  const text = String(value || '').trim().slice(0, 60);
  if (!text) return null;
  return CITIES.find((c) => c.toLowerCase() === text.toLowerCase()) || text;
}

module.exports = { SERVICE_CATEGORIES, CITIES, isServiceCategory, normalizeCity };
