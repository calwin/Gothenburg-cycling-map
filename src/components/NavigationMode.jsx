import { useState, useEffect, useRef } from 'react'

function NavigationMode({
  routeInfo,
  userLocation,
  onClose,
  onReroute
}) {
  const REROUTE_DISTANCE_METERS = 45
  const REROUTE_DELAY_MS = 3000
  const [currentStep, setCurrentStep] = useState(0)
  const [distanceToNext, setDistanceToNext] = useState(null)
  const [eta, setEta] = useState(null)
  const [isRerouting, setIsRerouting] = useState(false)
  const rerouteTimerRef = useRef(null)

  const instructions = routeInfo?.instructions || []
  const routeCoords = routeInfo?.geometry?.coordinates || []

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  const getDistanceToRoute = (lat, lng) => {
    if (!routeCoords || routeCoords.length === 0) return Infinity
    if (routeCoords.length === 1) {
      return getDistance(lat, lng, routeCoords[0][1], routeCoords[0][0])
    }

    const toMeters = (latDeg, lngDeg, referenceLat) => {
      const metersPerDegLat = 111132
      const metersPerDegLng = 111320 * Math.cos(referenceLat * Math.PI / 180)
      return {
        x: lngDeg * metersPerDegLng,
        y: latDeg * metersPerDegLat
      }
    }

    const getDistanceToSegment = (point, start, end) => {
      const segX = end.x - start.x
      const segY = end.y - start.y
      const segLenSq = segX * segX + segY * segY
      if (segLenSq === 0) {
        return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2)
      }

      const t = Math.max(0, Math.min(1, ((point.x - start.x) * segX + (point.y - start.y) * segY) / segLenSq))
      const projX = start.x + t * segX
      const projY = start.y + t * segY

      return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)
    }

    let minDist = Infinity
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const start = routeCoords[i]
      const end = routeCoords[i + 1]
      const referenceLat = (lat + start[1] + end[1]) / 3

      const pointMeters = toMeters(lat, lng, referenceLat)
      const startMeters = toMeters(start[1], start[0], referenceLat)
      const endMeters = toMeters(end[1], end[0], referenceLat)

      const d = getDistanceToSegment(pointMeters, startMeters, endMeters)
      if (d < minDist) minDist = d
    }
    return minDist
  }

  useEffect(() => {
    setCurrentStep(0)
    setDistanceToNext(null)
    setIsRerouting(false)
    if (rerouteTimerRef.current) {
      clearTimeout(rerouteTimerRef.current)
      rerouteTimerRef.current = null
    }
  }, [routeInfo])

  useEffect(() => {
    if (!userLocation) return

    const stepLoc = instructions[currentStep]?.location
    if (!stepLoc) {
      setDistanceToNext(null)
      return
    }

    const dist = getDistance(userLocation.lat, userLocation.lng, stepLoc[0], stepLoc[1])
    setDistanceToNext(dist)

    if (dist < 25 && currentStep < instructions.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }, [userLocation, currentStep, instructions])

  useEffect(() => {
    if (!userLocation || !onReroute || routeCoords.length < 2 || isRerouting) return

    const distToRoute = getDistanceToRoute(userLocation.lat, userLocation.lng)
    if (distToRoute > REROUTE_DISTANCE_METERS) {
      if (!rerouteTimerRef.current) {
        rerouteTimerRef.current = setTimeout(() => {
          rerouteTimerRef.current = null
          setIsRerouting(true)
          onReroute({ lat: userLocation.lat, lng: userLocation.lng })
        }, REROUTE_DELAY_MS)
      }
      return
    }

    if (rerouteTimerRef.current) {
      clearTimeout(rerouteTimerRef.current)
      rerouteTimerRef.current = null
    }
  }, [userLocation, onReroute, routeCoords, isRerouting])

  useEffect(() => {
    const remainingDist = instructions
      .slice(currentStep)
      .reduce((sum, inst) => sum + (inst.distance || 0), 0)
    const avgSpeed = routeInfo?.mode === 'walking' ? 5 : 15
    setEta(Math.round((remainingDist / 1000) / avgSpeed * 60))
  }, [instructions, currentStep, routeInfo?.mode])

  useEffect(() => {
    return () => {
      if (rerouteTimerRef.current) clearTimeout(rerouteTimerRef.current)
    }
  }, [])

  const currentInstruction = instructions[currentStep]
  const nextInstruction = instructions[currentStep + 1]
  if (!currentInstruction) return null

  const isLastStep = currentStep === instructions.length - 1
  const remainingDist = instructions.slice(currentStep).reduce((sum, i) => sum + (i.distance || 0), 0)

  const formatDistance = (meters) => {
    if (!meters && meters !== 0) return ''
    if (meters < 1000) return `${Math.round(meters)} m`
    return `${(meters / 1000).toFixed(1)} km`
  }

  const formatEta = (minutes) => {
    if (minutes == null) return '--'
    if (minutes < 60) return `${minutes} min`
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  }

  const getDirectionIcon = (type) => {
    const icons = {
      'depart': '↑', 'arrive': '⚑',
      'turn-left': '←', 'turn-right': '→',
      'turn-sharp-left': '↰', 'turn-sharp-right': '↱',
      'turn-slight-left': '↖', 'turn-slight-right': '↗',
      'continue': '↑', 'straight': '↑',
      'roundabout': '↻', 'uturn-left': '↩', 'uturn-right': '↩',
      'merge': '↗', 'merge-left': '↖', 'merge-right': '↗',
      'ferry': '⛴', 'waypoint': '◆'
    }
    return icons[type] || '↑'
  }

  return (
    <>
      {/* TOP BAR - Current instruction (Google Maps style green bar) */}
      <div className="nav-top">
        {isRerouting && <div className="nav-rerouting">Rerouting...</div>}

        <div className="nav-top-main">
          <div className="nav-top-icon">
            {getDirectionIcon(currentInstruction.type)}
          </div>
          <div className="nav-top-info">
            <div className="nav-top-distance">
              {distanceToNext !== null && distanceToNext < 500
                ? formatDistance(distanceToNext)
                : formatDistance(currentInstruction.distance)}
            </div>
            <div className="nav-top-text">{currentInstruction.text}</div>
          </div>
        </div>

        {nextInstruction && !isLastStep && (
          <div className="nav-top-next">
            Then {getDirectionIcon(nextInstruction.type)} {nextInstruction.text}
          </div>
        )}

        {isLastStep && (
          <div className="nav-top-next nav-top-arrived">
            You have arrived!
          </div>
        )}
      </div>

      {/* BOTTOM BAR - ETA, distance, controls */}
      <div className="nav-bottom">
        <div className="nav-bottom-info">
          <span className="nav-bottom-eta">{formatEta(eta)}</span>
          <span className="nav-bottom-dot">·</span>
          <span className="nav-bottom-dist">{formatDistance(remainingDist)}</span>
          {userLocation && <span className="nav-bottom-gps">GPS</span>}
        </div>
        <div className="nav-bottom-actions">
          <button
            className="nav-bottom-btn"
            onClick={() => currentStep > 0 && setCurrentStep(currentStep - 1)}
            disabled={currentStep === 0}
          >◀</button>
          <span className="nav-bottom-step">{currentStep + 1}/{instructions.length}</span>
          <button
            className="nav-bottom-btn"
            onClick={() => !isLastStep && setCurrentStep(currentStep + 1)}
            disabled={isLastStep}
          >▶</button>
          <button className="nav-bottom-exit" onClick={onClose}>Exit</button>
        </div>
      </div>
    </>
  )
}

export default NavigationMode
