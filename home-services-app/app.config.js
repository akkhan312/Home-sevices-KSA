// Extends app.json with values that differ per environment (read by Expo CLI and EAS Build).
//   GOOGLE_MAPS_API_KEY  Google Maps SDK for Android key — maps are blank on Android release builds without it.
//   EAS_PROJECT_ID       EAS project id — needed for push notification tokens (or run `eas init` and add it to app.json).
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  return {
    ...config,
    android: {
      ...config.android,
      ...(mapsKey ? { config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } } : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
    },
  };
};
