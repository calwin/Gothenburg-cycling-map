import axios from 'axios'

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY
const ORS_BASE_URL = 'https://api.openrouteservice.org'

// Check if API key is configured
export const isConfigured = () => {
  return ORS_API_KEY && ORS_API_KEY !== 'your_api_key_here'
}

// Profile mapping
const PROFILES = {
  cycling: 'cycling-regular',
  walking: 'foot-walking'
}

/**
 * Get directions between two points
 */
export async function getDirections(start, end, mode = 'cycling', options = {}) {
  if (!isConfigured()) {
    throw new Error('OpenRouteService API key not configured')
  }

  const profile = PROFILES[mode] || PROFILES.cycling
  const isCycling = mode === 'cycling'

  try {
    // Build request body
    const requestBody = {
      coordinates: [
        [start.lng, start.lat],
        [end.lng, end.lat]
      ],
      elevation: true,
      instructions: true,
      units: 'm',
      language: 'en'
    }

    // Configure based on route type
    const routeType = options.routeType || 'recommended'

    if (isCycling) {
      // Cycling profiles: green/quiet weightings NOT supported
      // Valid options: preference, avoid_features, steepness_difficulty (0-3)
      switch (routeType) {
        case 'scenic':
          // SCENIC: Absolutely avoid highways, take scenic route however long
          // Use 'recommended' which prefers bike-friendly paths over distance
          requestBody.preference = 'recommended'
          requestBody.options = {
            avoid_features: ['highways', 'tollways', 'ferries'],
            // Avoid polygons could be added for specific highway areas if needed
          }
          break

        case 'quiet':
          // Quiet: Avoid busy roads, prefer residential streets
          requestBody.preference = 'recommended'
          requestBody.options = {
            avoid_features: ['highways', 'tollways', 'ferries']
          }
          break

        case 'safe':
          // Easy route for beginners - avoid steep hills and steps
          requestBody.preference = 'recommended'
          requestBody.options = {
            avoid_features: ['highways', 'tollways', 'steps'],
            profile_params: {
              weightings: {
                steepness_difficulty: 0 // Novice - prefer flat routes
              }
            }
          }
          break

        case 'shortest':
        default:
          requestBody.preference = 'shortest'
          break
      }
    } else {
      // Walking profiles: green and quiet weightings ARE supported (0-15 scale)
      switch (routeType) {
        case 'scenic':
          // SCENIC: Maximum green preference, avoid all highways, however long
          requestBody.preference = 'recommended'
          requestBody.options = {
            avoid_features: ['highways', 'tollways', 'ferries'],
            profile_params: {
              weightings: {
                green: 15,  // Maximum green preference
                quiet: 10
              }
            }
          }
          break

        case 'quiet':
          // Prefer quiet areas, avoid noise
          requestBody.preference = 'recommended'
          requestBody.options = {
            avoid_features: ['highways', 'tollways', 'ferries'],
            profile_params: {
              weightings: {
                quiet: 15,  // Maximum quiet preference
                green: 8
              }
            }
          }
          break

        case 'safe':
          // Avoid steps and prefer quiet, accessible routes
          requestBody.preference = 'recommended'
          requestBody.options = {
            avoid_features: ['highways', 'tollways', 'steps', 'fords'],
            profile_params: {
              weightings: {
                quiet: 10
              }
            }
          }
          break

        case 'shortest':
        default:
          requestBody.preference = 'shortest'
          break
      }
    }

    const response = await axios.post(
      `${ORS_BASE_URL}/v2/directions/${profile}/geojson`,
      requestBody,
      {
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    )

    const feature = response.data.features[0]
    const properties = feature.properties
    const summary = properties.summary
    const segments = properties.segments[0]

    return {
      distance: summary.distance,
      duration: summary.duration,
      ascent: properties.ascent || 0,
      descent: properties.descent || 0,
      instructions: segments.steps.map(step => ({
        text: step.instruction,
        distance: step.distance,
        duration: step.duration,
        type: step.type,
        name: step.name
      })),
      geometry: feature.geometry,
      elevation: extractElevationProfile(feature.geometry.coordinates)
    }
  } catch (error) {
    console.error('ORS Directions error:', error.response?.data || error.message)
    throw new Error(error.response?.data?.error?.message || 'Failed to get directions')
  }
}

/**
 * Extract elevation profile from coordinates
 */
function extractElevationProfile(coordinates) {
  if (!coordinates || coordinates.length === 0) return []

  let cumulativeDistance = 0
  const profile = []

  for (let i = 0; i < coordinates.length; i++) {
    const coord = coordinates[i]
    const elevation = coord[2] || 0

    if (i > 0) {
      const prev = coordinates[i - 1]
      const dist = haversineDistance(prev[1], prev[0], coord[1], coord[0])
      cumulativeDistance += dist
    }

    // Sample every ~50m to keep data manageable
    if (i === 0 || i === coordinates.length - 1 || i % 5 === 0) {
      profile.push({
        distance: cumulativeDistance,
        elevation: elevation
      })
    }
  }

  return profile
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth's radius in meters
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg) {
  return deg * (Math.PI / 180)
}

/**
 * Geocode an address to coordinates
 */
export async function geocode(query, bounds) {
  if (!isConfigured()) {
    throw new Error('OpenRouteService API key not configured')
  }

  try {
    const params = {
      api_key: ORS_API_KEY,
      text: query,
      size: 8,
      // Focus on Gothenburg area
      'focus.point.lat': 57.7089,
      'focus.point.lon': 11.9746,
      'boundary.country': 'SE'
    }

    // Add bounding box if provided (soft boundary)
    if (bounds) {
      params['boundary.rect.min_lon'] = bounds.minLng
      params['boundary.rect.min_lat'] = bounds.minLat
      params['boundary.rect.max_lon'] = bounds.maxLng
      params['boundary.rect.max_lat'] = bounds.maxLat
    }

    const response = await axios.get(`${ORS_BASE_URL}/geocode/search`, { params })

    return response.data.features.map(feature => {
      const props = feature.properties
      // Format a cleaner name
      let name = props.name || props.label
      if (props.street && !name.includes(props.street)) {
        name = props.street + (props.housenumber ? ' ' + props.housenumber : '')
      }
      if (props.locality && props.locality !== 'Göteborg') {
        name += ', ' + props.locality
      } else if (props.neighbourhood) {
        name += ', ' + props.neighbourhood
      }

      return {
        name: name || props.label,
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0]
      }
    })
  } catch (error) {
    console.error('ORS Geocode error:', error.response?.data || error.message)
    throw new Error('Failed to search location')
  }
}

export default {
  isConfigured,
  getDirections,
  geocode
}
