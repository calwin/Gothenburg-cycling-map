import axios from 'axios'

// Free public Valhalla server hosted by FOSSGIS
const VALHALLA_BASE_URL = 'https://valhalla1.openstreetmap.de'

// Costing options for different route types
// Valhalla bicycle costing: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/#bicycle-costing-options
function getCostingOptions(routeType) {
  switch (routeType) {
    case 'scenic':
      // MAXIMUM preference for bike paths and cycleways
      // use_roads: 0 = only use roads if no other option
      return {
        bicycle_type: 'Hybrid',
        use_roads: 0.0,           // NEVER use roads with cars if possible
        use_hills: 0.5,           // Accept some hills for better paths
        avoid_bad_surfaces: 0.3,  // Accept some gravel for scenic paths
        use_living_streets: 1.0,  // Maximum preference for living streets
        use_ferry: 0.0,           // Avoid ferries
        shortest: false           // Don't optimize for distance
      }

    case 'quiet':
      // Avoid traffic, prefer residential - but allow some roads
      return {
        bicycle_type: 'Hybrid',
        use_roads: 0.1,           // Strongly avoid roads
        use_hills: 0.5,
        avoid_bad_surfaces: 0.5,
        use_living_streets: 1.0,
        shortest: false
      }

    case 'safe':
      // Easy route - flat, good surfaces, some road usage OK
      return {
        bicycle_type: 'Hybrid',
        use_roads: 0.3,           // Allow some roads
        use_hills: 0.0,           // Avoid hills completely
        avoid_bad_surfaces: 1.0,  // Only paved surfaces
        use_living_streets: 0.8,
        shortest: false
      }

    case 'shortest':
    default:
      // Fastest/shortest - use any road
      return {
        bicycle_type: 'Road',
        use_roads: 1.0,           // Use roads freely
        use_hills: 0.5,
        avoid_bad_surfaces: 0.5,
        shortest: true            // Optimize for distance
      }
  }
}

/**
 * Map Valhalla maneuver type (numeric) to a text type for navigation icons
 * https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/#maneuver-object
 */
function mapManeuverType(type) {
  const types = {
    0: 'none',
    1: 'depart',
    2: 'depart-right',
    3: 'depart-left',
    4: 'arrive',
    5: 'arrive-right',
    6: 'arrive-left',
    7: 'continue',
    8: 'turn-slight-right',
    9: 'turn-right',
    10: 'turn-sharp-right',
    11: 'uturn-right',
    12: 'uturn-left',
    13: 'turn-sharp-left',
    14: 'turn-left',
    15: 'turn-slight-left',
    16: 'continue',
    17: 'roundabout',
    18: 'roundabout',
    19: 'roundabout',
    20: 'roundabout',
    21: 'ferry',
    22: 'ferry',
    23: 'merge',
    24: 'turn-right',
    25: 'turn-left',
    26: 'merge-right',
    27: 'merge-left',
    37: 'straight'
  }
  return types[type] || 'continue'
}

/**
 * Get cycling directions using Valhalla
 * Supports multiple waypoints for scenic routing through green spaces
 * @param {Object} start - Start point {lat, lng}
 * @param {Object} end - End point {lat, lng}
 * @param {string} routeType - Route type (scenic, quiet, safe, shortest)
 * @param {Array} waypoints - Optional intermediate waypoints [{lat, lng, name}, ...]
 */
export async function getCyclingDirections(start, end, routeType = 'scenic', waypoints = []) {
  const costingOptions = getCostingOptions(routeType)

  // Build locations array: start -> waypoints -> end
  const locations = [
    { lat: start.lat, lon: start.lng }
  ]

  // Add waypoints in order
  for (const wp of waypoints) {
    locations.push({ lat: wp.lat, lon: wp.lng })
  }

  locations.push({ lat: end.lat, lon: end.lng })

  const requestBody = {
    locations,
    costing: 'bicycle',
    costing_options: {
      bicycle: costingOptions
    },
    directions_options: {
      units: 'kilometers',
      language: 'en-US'
    }
  }

  try {
    const response = await axios.post(
      `${VALHALLA_BASE_URL}/route`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    const trip = response.data.trip

    // Combine all legs (for multi-waypoint routes)
    let allCoordinates = []
    let allInstructions = []

    for (let i = 0; i < trip.legs.length; i++) {
      const leg = trip.legs[i]
      const coordinates = decodePolyline(leg.shape)

      // Add coordinates (skip first point of subsequent legs to avoid duplicates)
      if (i === 0) {
        allCoordinates = coordinates
      } else {
        allCoordinates = allCoordinates.concat(coordinates.slice(1))
      }

      // Add instructions with location from the route shape
      const legInstructions = leg.maneuvers.map(m => {
        // Valhalla gives begin_shape_index - the index into the decoded shape
        const shapeIdx = m.begin_shape_index || 0
        const coord = coordinates[shapeIdx] || coordinates[0]
        return {
          text: m.instruction,
          distance: m.length * 1000,
          duration: m.time,
          type: mapManeuverType(m.type),
          name: m.street_names ? m.street_names.join(', ') : '',
          location: coord ? [coord[0], coord[1]] : null // [lat, lng]
        }
      })

      // Add waypoint arrival marker if this isn't the last leg
      if (i < trip.legs.length - 1 && waypoints[i]) {
        legInstructions.push({
          text: `Via ${waypoints[i].name || 'green space'}`,
          distance: 0,
          duration: 0,
          type: 'waypoint',
          name: waypoints[i].name || '',
          location: [waypoints[i].lat, waypoints[i].lng]
        })
      }

      allInstructions = allInstructions.concat(legInstructions)
    }

    return {
      distance: trip.summary.length * 1000,
      duration: trip.summary.time,
      ascent: null,
      descent: null,
      instructions: allInstructions,
      geometry: {
        type: 'LineString',
        coordinates: allCoordinates.map(c => [c[1], c[0]])
      },
      elevation: null,
      source: 'valhalla',
      waypoints: waypoints.map(wp => ({ name: wp.name, lat: wp.lat, lng: wp.lng }))
    }
  } catch (error) {
    console.error('Valhalla routing error:', error.response?.data || error.message)
    throw new Error(error.response?.data?.error || 'Failed to get cycling directions from Valhalla')
  }
}

/**
 * Decode Valhalla's encoded polyline (uses precision 6)
 */
function decodePolyline(encoded, precision = 6) {
  const factor = Math.pow(10, precision)
  const decoded = []
  let lat = 0
  let lng = 0
  let index = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1)
    lat += dlat

    shift = 0
    result = 0

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1)
    lng += dlng

    decoded.push([lat / factor, lng / factor])
  }

  return decoded
}

export default {
  getCyclingDirections
}
