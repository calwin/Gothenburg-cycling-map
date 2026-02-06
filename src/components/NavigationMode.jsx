import { useState, useEffect, useRef } from 'react'

function NavigationMode({
  routeInfo,
  userLocation,
  onClose,
  onReroute
}) {
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
    let minDist = Infinity
    for (let i = 0; i < routeCoords.length; i++) {
      const d = getDistance(lat, lng, routeCoords[i][1], routeCoords[i][0])
      if (d < minDist) minDist = d
    }
    return minDist
  }

  useEffect(() => {
    setCurrentStep(0)
    setIsRerouting(false)
  }, [routeInfo])

  useEffect(() => {
    if (!userLocation || !instructions[currentStep]?.location) return

    const stepLoc = instructions[currentStep].location
    const dist = getDistance(userLocation.lat, userLocation.lng, stepLoc[0], stepLoc[1])
    setDistanceToNext(dist)

    if (dist < 25 && currentStep < instructions.length - 1) {
      setCurrentStep(prev => prev + 1)
    }

    if (onReroute && routeCoords.length > 0 && !isRerouting) {
      const distToRoute = getDistanceToRoute(userLocation.lat, userLocation.lng)
      if (distToRoute > 50) {
        if (!rerouteTimerRef.current) {
          rerouteTimerRef.current = setTimeout(() => {
            setIsRerouting(true)
            onReroute({ lat: userLocation.lat, lng: userLocation.lng })
            rerouteTimerRef.current = null
          }, 5000)
        }
      } else {
        if (rerouteTimerRef.current) {
          clearTimeout(rerouteTimerRef.current)
          rerouteTimerRef.current = null
        }
      }
    }

    const remainingDist = instructions
      .slice(currentStep)
      .reduce((sum, inst) => sum + (inst.distance || 0), 0)
    const avgSpeed = routeInfo?.mode === 'walking' ? 5 : 15
    setEta(Math.round((remainingDist / 1000) / avgSpeed * 60))
  }, [userLocation, currentStep, instructions, routeInfo?.mode, routeCoords, onReroute, isRerouting])

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
    if (!minutes) return '--'
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
