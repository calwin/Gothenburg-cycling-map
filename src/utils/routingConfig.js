// OpenRouteService API configuration
export const ORS_CONFIG = {
  baseUrl: 'https://api.openrouteservice.org/v2',
  profiles: {
    cycling: 'cycling-safe',     // Safer cycling routes avoiding major roads
    walking: 'foot-walking'      // Pedestrian routes
  },
  // Default routing preferences
  preferences: {
    preference: 'recommended',   // Could also be 'fastest' or 'shortest'
    avoid_features: ['highways', 'tollways'],
    profile_params: {
      weightings: {
        green: 0.8,    // Prefer routes through green areas (0-1)
        quiet: 0.6     // Prefer quieter roads (0-1)
      }
    }
  }
}

// Gothenburg map settings
export const GOTHENBURG = {
  center: [57.7089, 11.9746],
  zoom: 13,
  bounds: {
    south: 57.6,
    west: 11.8,
    north: 57.85,
    east: 12.15
  }
}

// Map tile providers
export const TILE_PROVIDERS = {
  cyclosm: {
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.cyclosm.org">CyclOSM</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }
}
