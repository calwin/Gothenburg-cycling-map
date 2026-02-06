// Simple route rating service using localStorage
// In a real app, this would connect to a backend API

const RATINGS_KEY = 'gothenburg_route_ratings'

/**
 * Generate a unique route ID based on start, end, mode, and routeType
 */
function generateRouteId(start, end, mode, routeType) {
  // Round coordinates to reduce slight variations
  const s = `${start.lat.toFixed(4)},${start.lng.toFixed(4)}`
  const e = `${end.lat.toFixed(4)},${end.lng.toFixed(4)}`
  return `${s}_${e}_${mode}_${routeType}`
}

/**
 * Get all stored ratings
 */
function getAllRatings() {
  try {
    const stored = localStorage.getItem(RATINGS_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch (e) {
    console.error('Failed to load ratings:', e)
    return {}
  }
}

/**
 * Save ratings to localStorage
 */
function saveRatings(ratings) {
  try {
    localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings))
  } catch (e) {
    console.error('Failed to save ratings:', e)
  }
}

/**
 * Rate a route (thumbs up or down)
 * @param {Object} routeData - { start, end, mode, routeType, distance }
 * @param {boolean} isPositive - true for thumbs up, false for thumbs down
 */
export function rateRoute(routeData, isPositive) {
  const { start, end, mode, routeType, distance } = routeData
  const routeId = generateRouteId(start, end, mode, routeType)

  const ratings = getAllRatings()

  if (!ratings[routeId]) {
    ratings[routeId] = {
      routeId,
      mode,
      routeType,
      distance,
      thumbsUp: 0,
      thumbsDown: 0,
      userRating: null,
      firstRated: new Date().toISOString()
    }
  }

  const route = ratings[routeId]
  const previousRating = route.userRating

  // Handle rating changes
  if (previousRating === 'up' && !isPositive) {
    route.thumbsUp--
    route.thumbsDown++
    route.userRating = 'down'
  } else if (previousRating === 'down' && isPositive) {
    route.thumbsDown--
    route.thumbsUp++
    route.userRating = 'up'
  } else if (previousRating === 'up' && isPositive) {
    // Clicking same rating again removes it
    route.thumbsUp--
    route.userRating = null
  } else if (previousRating === 'down' && !isPositive) {
    route.thumbsDown--
    route.userRating = null
  } else if (previousRating === null) {
    if (isPositive) {
      route.thumbsUp++
      route.userRating = 'up'
    } else {
      route.thumbsDown++
      route.userRating = 'down'
    }
  }

  route.lastRated = new Date().toISOString()

  saveRatings(ratings)
  return route
}

/**
 * Get rating for a specific route
 */
export function getRouteRating(start, end, mode, routeType) {
  const routeId = generateRouteId(start, end, mode, routeType)
  const ratings = getAllRatings()
  return ratings[routeId] || null
}

/**
 * Get user's rating for a route
 * @returns 'up' | 'down' | null
 */
export function getUserRating(start, end, mode, routeType) {
  const rating = getRouteRating(start, end, mode, routeType)
  return rating?.userRating || null
}

/**
 * Get statistics about all ratings
 */
export function getRatingStats() {
  const ratings = getAllRatings()
  const routes = Object.values(ratings)

  return {
    totalRoutes: routes.length,
    totalThumbsUp: routes.reduce((sum, r) => sum + r.thumbsUp, 0),
    totalThumbsDown: routes.reduce((sum, r) => sum + r.thumbsDown, 0),
    byRouteType: {
      scenic: routes.filter(r => r.routeType === 'scenic'),
      quiet: routes.filter(r => r.routeType === 'quiet'),
      safe: routes.filter(r => r.routeType === 'safe'),
      shortest: routes.filter(r => r.routeType === 'shortest')
    }
  }
}

export default {
  rateRoute,
  getRouteRating,
  getUserRating,
  getRatingStats
}
