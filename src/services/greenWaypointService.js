import axios from 'axios'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Cache for scenic places to avoid repeated API calls
let scenicPlacesCache = null
let cacheTimestamp = null
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Scenic place types and their scores (higher = more desirable)
// Only include AREAS you can cycle THROUGH, not dead-end points
const SCENIC_TYPES = {
  // Green spaces - areas with paths through them
  park: { score: 25, icon: '🌳', label: 'Park' },
  nature_reserve: { score: 22, icon: '🦌', label: 'Nature Reserve' },
  forest: { score: 18, icon: '🌲', label: 'Forest' },
  garden: { score: 15, icon: '🌷', label: 'Garden' },
  meadow: { score: 12, icon: '🌻', label: 'Meadow' },

  // Waterside paths - routes along water
  river: { score: 20, icon: '🌊', label: 'Riverside' },
  canal: { score: 18, icon: '🚣', label: 'Canal path' },

  // Coastal areas with paths
  beach: { score: 20, icon: '🏖️', label: 'Beach' },
  marina: { score: 15, icon: '⛵', label: 'Marina' }
}

// Types to EXCLUDE - these are point locations that cause backtracking
const EXCLUDED_TYPES = ['viewpoint', 'water', 'lake']

/**
 * Fetch scenic places in Gothenburg area (parks, rivers, viewpoints, etc.)
 */
async function fetchGreenSpaces() {
  // Check cache
  if (scenicPlacesCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
    return scenicPlacesCache
  }

  // Gothenburg bounding box (slightly expanded)
  const bbox = '57.6,11.8,57.8,12.1'

  // Only fetch AREAS that have paths through them - not point locations
  const query = `
    [out:json][timeout:45];
    (
      // Parks and green spaces - these have paths through them
      way["leisure"="park"](${bbox});
      way["landuse"="forest"](${bbox});
      way["leisure"="garden"](${bbox});
      way["leisure"="nature_reserve"](${bbox});
      way["landuse"="meadow"](${bbox});
      relation["leisure"="park"](${bbox});
      relation["landuse"="forest"](${bbox});

      // Waterside paths - rivers/canals often have cycle paths along them
      way["waterway"="river"](${bbox});
      way["waterway"="canal"](${bbox});

      // Coastal areas with paths
      way["natural"="beach"](${bbox});
      way["leisure"="marina"](${bbox});
    );
    out center;
  `

  try {
    const response = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    const scenicPlaces = response.data.elements
      // Only use ways and relations (areas), not nodes (points)
      .filter(el => el.type !== 'node' && (el.center || (el.lat && el.lon)))
      .map(el => {
        // Determine the type - prefer leisure/landuse for areas
        const type = el.tags?.leisure || el.tags?.landuse ||
                     el.tags?.waterway || el.tags?.natural || 'green'

        // Skip excluded types (water bodies without paths)
        if (EXCLUDED_TYPES.includes(type)) {
          return null
        }

        const typeInfo = SCENIC_TYPES[type] || { score: 10, icon: '🌿', label: 'Scenic' }

        return {
          id: el.id,
          name: el.tags?.name || typeInfo.label,
          lat: el.center?.lat || el.lat,
          lng: el.center?.lon || el.lon,
          type,
          typeScore: typeInfo.score,
          icon: typeInfo.icon
        }
      })
      .filter(Boolean) // Remove nulls from excluded types

    scenicPlacesCache = scenicPlaces
    cacheTimestamp = Date.now()

    console.log(`Loaded ${scenicPlaces.length} scenic places`)
    return scenicPlaces
  } catch (error) {
    console.error('Failed to fetch scenic places:', error)
    return scenicPlacesCache || []
  }
}

/**
 * Calculate distance between two points in meters (Haversine)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Check if a point is within a corridor between start and end
 * The corridor is an ellipse with start and end as foci
 */
function isInCorridor(point, start, end, maxDetour = 1.3) {
  const directDistance = haversineDistance(start.lat, start.lng, end.lat, end.lng)
  const distToStart = haversineDistance(point.lat, point.lng, start.lat, start.lng)
  const distToEnd = haversineDistance(point.lat, point.lng, end.lat, end.lng)

  // Point is in corridor if going through it adds less than maxDetour of direct distance
  const totalViaPoint = distToStart + distToEnd
  return totalViaPoint <= directDistance * maxDetour
}

/**
 * Find green spaces that are good waypoint candidates
 * - Within the route corridor (not too far off path)
 * - Not too close to start or end
 * - Reasonably spaced from each other
 */
export async function findGreenWaypoints(start, end, options = {}) {
  const {
    maxWaypoints = 2,        // Maximum waypoints to add
    maxDetourFactor = 1.25,  // Allow up to 25% longer route (tighter corridor)
    minDistanceFromEndpoints = 500, // At least 500m from start/end
    minSpacingBetweenWaypoints = 800, // At least 800m between waypoints
    maxPerpendicularDistance = 500 // Max 500m off the direct line
  } = options

  const greenSpaces = await fetchGreenSpaces()
  const directDistance = haversineDistance(start.lat, start.lng, end.lat, end.lng)

  // Don't add waypoints for very short routes
  if (directDistance < 1000) {
    return []
  }

  // Filter green spaces in the corridor
  const candidates = greenSpaces
    .filter(gs => {
      // Must be in corridor (ellipse check)
      if (!isInCorridor(gs, start, end, maxDetourFactor)) return false

      // Must be close to the direct line (not too far perpendicular)
      const perpDist = perpendicularDistance(gs, start, end)
      if (perpDist > maxPerpendicularDistance) return false

      // Not too close to start
      const distToStart = haversineDistance(gs.lat, gs.lng, start.lat, start.lng)
      if (distToStart < minDistanceFromEndpoints) return false

      // Not too close to end
      const distToEnd = haversineDistance(gs.lat, gs.lng, end.lat, end.lng)
      if (distToEnd < minDistanceFromEndpoints) return false

      return true
    })
    .map(gs => ({
      ...gs,
      distFromStart: haversineDistance(gs.lat, gs.lng, start.lat, start.lng),
      // Score based on: larger parks are better, closer to midpoint is better
      score: calculateWaypointScore(gs, start, end, directDistance)
    }))
    .sort((a, b) => b.score - a.score)

  // Select waypoints with good spacing
  const selectedWaypoints = []
  for (const candidate of candidates) {
    if (selectedWaypoints.length >= maxWaypoints) break

    // Check spacing from already selected waypoints
    const tooClose = selectedWaypoints.some(wp =>
      haversineDistance(wp.lat, wp.lng, candidate.lat, candidate.lng) < minSpacingBetweenWaypoints
    )

    if (!tooClose) {
      selectedWaypoints.push(candidate)
    }
  }

  // Sort by distance from start (so route goes through them in order)
  return selectedWaypoints.sort((a, b) => a.distFromStart - b.distFromStart)
}

/**
 * Calculate perpendicular distance from a point to the line between start and end
 * This helps find waypoints that are "along the way" rather than off to the side
 */
function perpendicularDistance(point, start, end) {
  // Convert to approximate meters for calculation
  const latScale = 111000 // ~111km per degree latitude
  const lngScale = 111000 * Math.cos(start.lat * Math.PI / 180)

  const x0 = point.lng * lngScale
  const y0 = point.lat * latScale
  const x1 = start.lng * lngScale
  const y1 = start.lat * latScale
  const x2 = end.lng * lngScale
  const y2 = end.lat * latScale

  // Calculate perpendicular distance from point to line
  const numerator = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
  const denominator = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2)

  return numerator / denominator
}

/**
 * Calculate a score for how good a waypoint candidate is
 * Prioritizes: viewpoints > water features > parks > forests
 * Also prefers waypoints ALONG the route direction
 */
function calculateWaypointScore(scenicPlace, start, end, directDistance) {
  let score = 0

  // MOST IMPORTANT: Prefer waypoints close to the direct line (low perpendicular distance)
  const perpDist = perpendicularDistance(scenicPlace, start, end)
  const perpPenalty = (perpDist / directDistance) * 200
  score -= perpPenalty

  // Type-based score (viewpoints, rivers, parks, etc.)
  score += scenicPlace.typeScore || 10

  // Prefer named places (usually more significant)
  const typeInfo = SCENIC_TYPES[scenicPlace.type]
  const defaultName = typeInfo?.label || 'Scenic'
  if (scenicPlace.name && scenicPlace.name !== defaultName) {
    score += 15
  }

  // Slight preference for waypoints closer to the midpoint (spreads them out)
  const midLat = (start.lat + end.lat) / 2
  const midLng = (start.lng + end.lng) / 2
  const distFromMid = haversineDistance(scenicPlace.lat, scenicPlace.lng, midLat, midLng)
  const midpointScore = Math.max(0, 15 - (distFromMid / directDistance) * 30)
  score += midpointScore

  return score
}

export default {
  findGreenWaypoints,
  fetchGreenSpaces
}
