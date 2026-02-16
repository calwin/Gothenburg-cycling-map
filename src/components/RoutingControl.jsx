import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-routing-machine'
import * as ors from '../services/openRouteService'
import * as valhalla from '../services/valhallaService'

// OSRM profiles - fallback when ORS is not configured
const OSRM_PROFILES = {
  cycling: 'bike',
  walking: 'foot'
}

// Create router using OSRM public demo server (fallback)
function createOSRMRouter(mode) {
  const profile = OSRM_PROFILES[mode] || 'bike'

  return L.Routing.osrmv1({
    serviceUrl: `https://routing.openstreetmap.de/routed-${profile}/route/v1`,
    profile: profile,
    useHints: false
  })
}

function RoutingControl({ start, end, mode, routeType, onRouteFound, onRouteError, onRoutingStart }) {
  const map = useMap()
  const routeLayerRef = useRef(null)
  const routingControlRef = useRef(null)
  const requestIdRef = useRef(0) // Track request to ignore stale responses

  // Cleanup function
  const clearRoute = () => {
    if (routeLayerRef.current) {
      try {
        map.removeLayer(routeLayerRef.current)
      } catch (e) {
        // Ignore
      }
      routeLayerRef.current = null
    }

    if (routingControlRef.current) {
      try {
        map.removeControl(routingControlRef.current)
      } catch (e) {
        // Ignore
      }
      routingControlRef.current = null
    }
  }

  useEffect(() => {
    if (!start || !end) return

    // Increment request ID to invalidate any pending requests
    const currentRequestId = ++requestIdRef.current

    // Clear previous route immediately
    clearRoute()

    // Notify that routing has started
    if (onRoutingStart) {
      onRoutingStart()
    }

    // For cycling: use Valhalla (better bike path preference)
    // For walking: use ORS (has green/quiet weightings)
    if (mode === 'cycling') {
      fetchValhallaRoute(start, end, routeType, currentRequestId)
    } else if (ors.isConfigured()) {
      fetchORSRoute(start, end, mode, routeType, currentRequestId)
    } else {
      fetchOSRMRoute(start, end, mode, currentRequestId)
    }

    return () => {
      clearRoute()
    }
  }, [map, start, end, mode, routeType])

  // Valhalla routing (best for cycling - has use_roads parameter)
  async function fetchValhallaRoute(start, end, routeType, requestId) {
    try {
      let waypoints = []

      // NOTE: Waypoint system disabled - it causes backtracking issues
      // Instead, we rely on Valhalla's use_roads=0 to prefer bike paths
      // The routing engine naturally finds paths through parks when they exist
      // TODO: Re-enable when we can find points ON paths, not park centers

      // Check if request is still valid after async waypoint lookup
      if (requestId !== requestIdRef.current) {
        return
      }

      const result = await valhalla.getCyclingDirections(start, end, routeType, waypoints)

      // Check if this request is still valid
      if (requestId !== requestIdRef.current) {
        return
      }

      clearRoute()
      drawRoute(result, 'cycling', waypoints)

      if (onRouteFound) {
        onRouteFound({
          distance: result.distance,
          duration: result.duration,
          mode,
          ascent: result.ascent,
          descent: result.descent,
          instructions: result.instructions,
          elevation: result.elevation,
          geometry: result.geometry,
          source: 'valhalla',
          greenWaypoints: waypoints
        })
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return
      }

      console.error('Valhalla routing failed, trying ORS:', error)
      // Fall back to ORS if configured, otherwise OSRM
      if (ors.isConfigured()) {
        fetchORSRoute(start, end, 'cycling', routeType, requestId)
      } else {
        fetchOSRMRoute(start, end, 'cycling', requestId)
      }
    }
  }

  // Helper to draw route on map
  function drawRoute(result, mode, waypoints = []) {
    const coordinates = result.geometry.coordinates.map(coord => [coord[1], coord[0]])

    const routeLayer = L.layerGroup()

    // Dark border for visibility
    L.polyline(coordinates, {
      color: '#1a1a1a',
      weight: 10,
      opacity: 0.8
    }).addTo(routeLayer)

    // Main route line - bright colors that stand out
    L.polyline(coordinates, {
      color: mode === 'cycling' ? '#ff6b00' : '#0066ff',
      weight: 6,
      opacity: 1
    }).addTo(routeLayer)

    // Add markers for scenic waypoints (parks, rivers, viewpoints, etc.)
    if (waypoints && waypoints.length > 0) {
      waypoints.forEach((wp) => {
        const icon = wp.icon || '🌳'
        const waypointIcon = L.divIcon({
          className: 'waypoint-marker',
          html: `<div class="waypoint-icon">${icon}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })

        L.marker([wp.lat, wp.lng], { icon: waypointIcon })
          .bindPopup(`<strong>Via:</strong> ${wp.name}`)
          .addTo(routeLayer)
      })
    }

    routeLayer.addTo(map)
    routeLayerRef.current = routeLayer

    // Fit map to route
    const bounds = L.latLngBounds(coordinates)
    map.fitBounds(bounds, { padding: [50, 50] })
  }

  // OpenRouteService routing
  async function fetchORSRoute(start, end, mode, routeType, requestId) {
    try {
      const result = await ors.getDirections(start, end, mode, { routeType })

      // Check if this request is still valid (not superseded by a new one)
      if (requestId !== requestIdRef.current) {
        return // Ignore stale response
      }

      // Clear any route that might have been drawn while waiting
      clearRoute()

      // Draw the route using helper
      drawRoute(result, mode)

      // Notify parent
      if (onRouteFound) {
        onRouteFound({
          distance: result.distance,
          duration: result.duration,
          mode,
          ascent: result.ascent,
          descent: result.descent,
          instructions: result.instructions,
          elevation: result.elevation,
          geometry: result.geometry, // Include for GPX export
          source: 'ors'
        })
      }
    } catch (error) {
      // Check if this request is still valid
      if (requestId !== requestIdRef.current) {
        return
      }

      console.error('ORS routing failed, falling back to OSRM:', error)
      // Fall back to OSRM
      fetchOSRMRoute(start, end, mode, requestId)
    }
  }

  // OSRM routing (fallback)
  function fetchOSRMRoute(start, end, mode, requestId) {
    // Check if still valid before starting
    if (requestId !== requestIdRef.current) {
      return
    }

    const router = createOSRMRouter(mode)

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(start.lat, start.lng),
        L.latLng(end.lat, end.lng)
      ],
      router: router,
      lineOptions: {
        styles: [
          { color: '#1a1a1a', opacity: 0.8, weight: 10 },
          { color: mode === 'cycling' ? '#ff6b00' : '#0066ff', opacity: 1, weight: 6 }
        ],
        extendToWaypoints: true,
        missingRouteTolerance: 0
      },
      show: false,
      addWaypoints: false,
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      createMarker: function() { return null }
    })

    routingControl.on('routesfound', function(e) {
      // Check if still valid
      if (requestId !== requestIdRef.current) {
        return
      }

      const routes = e.routes
      if (routes && routes.length > 0) {
        const route = routes[0]
        const geometryCoordinates = route.coordinates?.map(coord => [coord.lng, coord.lat]) || []

        if (onRouteFound) {
          onRouteFound({
            distance: route.summary.totalDistance,
            duration: route.summary.totalTime,
            mode,
            ascent: null,
            descent: null,
            instructions: route.instructions?.map((instr) => {
              const coord = route.coordinates?.[instr.index]
              return {
                text: instr.text,
                distance: instr.distance,
                duration: instr.time,
                type: instr.type,
                modifier: instr.modifier,
                name: instr.road,
                location: coord ? [coord.lat, coord.lng] : null
              }
            }) || [],
            elevation: null,
            geometry: {
              type: 'LineString',
              coordinates: geometryCoordinates
            },
            source: 'osrm'
          })
        }
      }
    })

    routingControl.on('routingerror', function(e) {
      if (requestId !== requestIdRef.current) {
        return
      }
      console.error('OSRM Routing error:', e.error)
      if (onRouteError) {
        onRouteError('Could not calculate route. Please try different locations.')
      }
    })

    routingControl.addTo(map)
    routingControlRef.current = routingControl
  }

  return null
}

export default RoutingControl
