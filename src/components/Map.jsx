import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import GreenSpaceLayer from './GreenSpaceLayer'
import RoutingControl from './RoutingControl'

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom marker icons
const createIcon = (color) => L.divIcon({
  className: 'custom-marker',
  html: `<div class="marker-pin ${color}"></div>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -42]
})

const startIcon = createIcon('start')
const endIcon = createIcon('end')

// Gothenburg center coordinates
const GOTHENBURG_CENTER = [57.7089, 11.9746]
const DEFAULT_ZOOM = 13
const NAV_ZOOM = 18

// Tile layer configurations
const TILE_LAYERS = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }
}

// Map click handler component
function MapClickHandler({ onClick }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng)
    }
  })
  return null
}

// Component to fit bounds when route changes
function FitBounds({ startPoint, endPoint }) {
  const map = useMap()

  useEffect(() => {
    if (startPoint && endPoint) {
      const bounds = L.latLngBounds([
        [startPoint.lat, startPoint.lng],
        [endPoint.lat, endPoint.lng]
      ])
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [map, startPoint, endPoint])

  return null
}

// Component to handle user's current location
function LocationButton() {
  const map = useMap()
  const markerRef = useRef(null)
  const circleRef = useRef(null)

  useEffect(() => {
    const locateControl = L.control({ position: 'topright' })

    locateControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control locate-control')
      div.innerHTML = '<button title="Find my location" aria-label="Find my location">📍</button>'
      div.onclick = (e) => {
        e.stopPropagation()
        map.locate({ setView: true, maxZoom: 16 })
      }
      return div
    }

    locateControl.addTo(map)

    // Reuse marker instead of creating new ones
    map.on('locationfound', (e) => {
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng)
        circleRef.current.setLatLng(e.latlng).setRadius(e.accuracy)
      } else {
        circleRef.current = L.circle(e.latlng, {
          radius: e.accuracy,
          color: '#4285f4',
          fillColor: '#4285f4',
          fillOpacity: 0.15,
          weight: 1
        }).addTo(map)

        const locIcon = L.divIcon({
          className: 'user-location-marker',
          html: '<div style="width:14px;height:14px;background:#4285f4;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
        markerRef.current = L.marker(e.latlng, { icon: locIcon }).addTo(map)
      }
    })

    map.on('locationerror', (e) => {
      console.error('Location error:', e.message)
    })

    return () => {
      locateControl.remove()
      if (markerRef.current) markerRef.current.remove()
      if (circleRef.current) circleRef.current.remove()
    }
  }, [map])

  return null
}

// Full Google Maps-style navigation tracker
function NavigationTracker({ isNavigating, onLocationUpdate, startPoint }) {
  const map = useMap()
  const [isFollowing, setIsFollowing] = useState(true)
  const isFollowingRef = useRef(true)
  const recenterControlRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)
  const watchIdRef = useRef(null)
  const lastHeadingRef = useRef(0)
  const lastPositionRef = useRef(null)
  const wakeLockRef = useRef(null)

  // Keep ref in sync with state
  useEffect(() => {
    isFollowingRef.current = isFollowing
  }, [isFollowing])

  // Calculate heading between two points
  const calculateHeading = (from, to) => {
    const lat1 = from.lat * Math.PI / 180
    const lat2 = to.lat * Math.PI / 180
    const dLon = (to.lng - from.lng) * Math.PI / 180
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    let heading = Math.atan2(y, x) * 180 / Math.PI
    return (heading + 360) % 360
  }

  useEffect(() => {
    if (!isNavigating) {
      // Cleanup when navigation stops
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
      if (markerRef.current) markerRef.current.remove()
      if (circleRef.current) circleRef.current.remove()
      if (recenterControlRef.current) recenterControlRef.current.remove()
      if (wakeLockRef.current) wakeLockRef.current.release()

      // Reset zoom controls etc
      map.setZoom(DEFAULT_ZOOM)

      watchIdRef.current = null
      markerRef.current = null
      circleRef.current = null
      recenterControlRef.current = null
      wakeLockRef.current = null
      lastPositionRef.current = null
      lastHeadingRef.current = 0
      return
    }

    // Keep screen awake during navigation
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch (e) {
        // Wake lock not supported or denied, that's ok
      }
    }
    requestWakeLock()

    // Immediately center on start point and zoom to street level
    if (startPoint) {
      map.setView([startPoint.lat, startPoint.lng], NAV_ZOOM, { animate: true })
    } else {
      map.setZoom(NAV_ZOOM)
    }

    // Invalidate map size after UI changes (header/controls hidden)
    setTimeout(() => map.invalidateSize(), 300)

    // Disable zoom controls during navigation for cleaner UI
    map.zoomControl.remove()

    // Add re-center button
    const recenterControl = L.control({ position: 'bottomright' })
    recenterControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control recenter-control')
      div.innerHTML = '<button title="Re-center" aria-label="Re-center on location">⊙</button>'
      div.style.display = 'none' // Hidden by default
      div.onclick = (e) => {
        e.stopPropagation()
        setIsFollowing(true)
        div.style.display = 'none'
        // Re-center immediately on last known position
        if (lastPositionRef.current) {
          const pos = lastPositionRef.current
          map.setView([pos.lat, pos.lng], NAV_ZOOM, { animate: true })
        }
      }
      return div
    }
    recenterControl.addTo(map)
    recenterControlRef.current = recenterControl

    // Detect when user manually drags the map
    const onDragStart = () => {
      setIsFollowing(false)
      if (recenterControlRef.current) {
        recenterControlRef.current.getContainer().style.display = 'block'
      }
    }
    map.on('dragstart', onDragStart)

    // Create arrow icon
    const createArrowIcon = (heading) => L.divIcon({
      className: 'user-location-marker',
      html: `
        <div class="nav-arrow-wrap">
          <svg class="nav-arrow-svg" viewBox="0 0 60 60" width="60" height="60">
            <circle cx="30" cy="30" r="28" fill="rgba(66,133,244,0.15)" />
            <g transform="rotate(${heading}, 30, 30)">
              <path d="M30 8 L42 38 L30 32 L18 38 Z" fill="#4285f4" stroke="white" stroke-width="2.5"/>
            </g>
            <circle cx="30" cy="30" r="6" fill="#4285f4" stroke="white" stroke-width="2"/>
          </svg>
        </div>
      `,
      iconSize: [60, 60],
      iconAnchor: [30, 30]
    })

    const updateLocation = (position) => {
      const { latitude, longitude, accuracy, heading: deviceHeading } = position.coords
      const latlng = [latitude, longitude]
      const currentPos = { lat: latitude, lng: longitude }

      // Calculate heading
      let heading = deviceHeading
      if ((heading === null || isNaN(heading)) && lastPositionRef.current) {
        const prev = lastPositionRef.current
        const dist = Math.sqrt(
          Math.pow(currentPos.lat - prev.lat, 2) +
          Math.pow(currentPos.lng - prev.lng, 2)
        )
        if (dist > 0.00003) { // ~3 meters
          heading = calculateHeading(prev, currentPos)
          lastHeadingRef.current = heading
        } else {
          heading = lastHeadingRef.current
        }
      } else if (heading !== null && !isNaN(heading)) {
        lastHeadingRef.current = heading
      } else {
        heading = lastHeadingRef.current
      }

      lastPositionRef.current = currentPos

      // Update or create arrow marker
      const arrowIcon = createArrowIcon(heading)
      if (markerRef.current) {
        markerRef.current.setLatLng(latlng)
        markerRef.current.setIcon(arrowIcon)
      } else {
        markerRef.current = L.marker(latlng, {
          icon: arrowIcon,
          zIndexOffset: 1000
        }).addTo(map)
      }

      // Update accuracy circle
      const cappedAccuracy = Math.min(accuracy, 80)
      if (circleRef.current) {
        circleRef.current.setLatLng(latlng)
        circleRef.current.setRadius(cappedAccuracy)
      } else {
        circleRef.current = L.circle(latlng, {
          radius: cappedAccuracy,
          color: '#4285f4',
          fillColor: '#4285f4',
          fillOpacity: 0.08,
          weight: 1,
          opacity: 0.3
        }).addTo(map)
      }

      // Follow user - keep them centered on map
      if (isFollowingRef.current) {
        map.setView(latlng, map.getZoom(), { animate: true, duration: 0.3 })
      }

      // Notify parent
      if (onLocationUpdate) {
        onLocationUpdate({ lat: latitude, lng: longitude, heading, accuracy })
      }
    }

    // Start GPS
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        updateLocation,
        (error) => console.error('GPS error:', error),
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 10000
        }
      )
    }

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
      if (circleRef.current) { circleRef.current.remove(); circleRef.current = null }
      if (recenterControlRef.current) { recenterControlRef.current.remove(); recenterControlRef.current = null }
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }
      map.off('dragstart', onDragStart)

      // Re-add zoom control
      L.control.zoom().addTo(map)
    }
  }, [map, isNavigating, onLocationUpdate])

  return null
}

function Map({
  mode,
  routeType,
  startPoint,
  endPoint,
  showGreenSpaces,
  onMapClick,
  onRouteFound,
  onRouteError,
  onRoutingStart,
  isDark,
  isNavigating,
  onLocationUpdate
}) {
  const tileConfig = isDark ? TILE_LAYERS.dark : TILE_LAYERS.light

  return (
    <MapContainer
      center={GOTHENBURG_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      {/* Tile layer based on theme */}
      <TileLayer
        key={isDark ? 'dark' : 'light'}
        attribution={tileConfig.attribution}
        url={tileConfig.url}
        maxZoom={20}
      />

      {/* Green spaces overlay */}
      {showGreenSpaces && <GreenSpaceLayer />}

      {/* Click handler */}
      <MapClickHandler onClick={onMapClick} />

      {/* Fit bounds when both points are set */}
      <FitBounds startPoint={startPoint} endPoint={endPoint} />

      {/* Location button */}
      <LocationButton />

      {/* Navigation tracking */}
      <NavigationTracker
        isNavigating={isNavigating}
        onLocationUpdate={onLocationUpdate}
        startPoint={startPoint}
      />

      {/* Start marker */}
      {startPoint && (
        <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon}>
          <Popup>
            <strong>Start</strong>
            {startPoint.address && <><br />{startPoint.address}</>}
            <br />
            <small>Click on map to set destination</small>
          </Popup>
        </Marker>
      )}

      {/* End marker */}
      {endPoint && (
        <Marker position={[endPoint.lat, endPoint.lng]} icon={endIcon}>
          <Popup>
            <strong>Destination</strong>
            {endPoint.address && <><br />{endPoint.address}</>}
          </Popup>
        </Marker>
      )}

      {/* Routing */}
      {startPoint && endPoint && (
        <RoutingControl
          start={startPoint}
          end={endPoint}
          mode={mode}
          routeType={routeType}
          onRouteFound={onRouteFound}
          onRouteError={onRouteError}
          onRoutingStart={onRoutingStart}
        />
      )}
    </MapContainer>
  )
}

export default Map
