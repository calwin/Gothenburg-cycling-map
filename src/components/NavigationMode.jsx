import { useState, useEffect } from 'react'

function NavigationMode({
  routeInfo,
  userLocation,
  onClose
}) {
  const [currentStep, setCurrentStep] = useState(0)
  const [distanceToNext, setDistanceToNext] = useState(null)
  const [eta, setEta] = useState(null)

  const instructions = routeInfo?.instructions || []

  // Calculate distance between two points
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3 // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

    return R * c
  }

  // Update distance and auto-advance when location changes
  useEffect(() => {
    if (!userLocation || !instructions[currentStep]?.location) return

    const stepLoc = instructions[currentStep].location
    const dist = getDistance(
      userLocation.lat,
      userLocation.lng,
      stepLoc[0],
      stepLoc[1]
    )
    setDistanceToNext(dist)

    // Auto-advance when within 25m of current step
    if (dist < 25 && currentStep < instructions.length - 1) {
      setCurrentStep(prev => prev + 1)
    }

    // Calculate ETA based on remaining distance
    const remainingDist = instructions
      .slice(currentStep)
      .reduce((sum, inst) => sum + (inst.distance || 0), 0)
    const avgSpeed = routeInfo?.mode === 'walking' ? 5 : 15 // km/h
    const etaMinutes = Math.round((remainingDist / 1000) / avgSpeed * 60)
    setEta(etaMinutes)

  }, [userLocation, currentStep, instructions, routeInfo?.mode])

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleNextStep = () => {
    if (currentStep < instructions.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const currentInstruction = instructions[currentStep]
  const nextInstruction = instructions[currentStep + 1]

  const formatDistance = (meters) => {
    if (!meters && meters !== 0) return ''
    if (meters < 1000) return `${Math.round(meters)} m`
    return `${(meters / 1000).toFixed(1)} km`
  }

  const formatEta = (minutes) => {
    if (!minutes) return ''
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  // Get direction icon (larger, clearer icons)
  const getDirectionIcon = (type) => {
    const icons = {
      'depart': '🚀',
      'arrive': '🏁',
      'turn-left': '⬅️',
      'turn-right': '➡️',
      'turn-sharp-left': '↩️',
      'turn-sharp-right': '↪️',
      'turn-slight-left': '↖️',
      'turn-slight-right': '↗️',
      'continue': '⬆️',
      'straight': '⬆️',
      'roundabout': '🔄',
      'rotary': '🔄',
      'fork-left': '↙️',
      'fork-right': '↘️',
      'merge': '🔀',
      'ramp': '📐',
      'ferry': '⛴️',
      'uturn': '↩️'
    }
    return icons[type] || '⬆️'
  }

  if (!currentInstruction) {
    return null
  }

  const isLastStep = currentStep === instructions.length - 1
  const progress = ((currentStep + 1) / instructions.length) * 100

  return (
    <div className="navigation-mode">
      {/* Close button */}
      <button className="nav-close-btn" onClick={onClose} aria-label="Exit navigation">
        ✕
      </button>

      {/* ETA and remaining info */}
      <div className="nav-eta-bar">
        <div className="nav-eta">
          <span className="nav-eta-time">{formatEta(eta) || '--'}</span>
          <span className="nav-eta-label">ETA</span>
        </div>
        <div className="nav-remaining">
          <span className="nav-remaining-dist">
            {formatDistance(
              instructions.slice(currentStep).reduce((sum, i) => sum + (i.distance || 0), 0)
            )}
          </span>
          <span className="nav-remaining-label">remaining</span>
        </div>
        {userLocation && (
          <div className="nav-gps-indicator">
            <span className="gps-dot"></span>
            GPS
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="nav-progress">
        <div
          className="nav-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current instruction - BIG and clear */}
      <div className="nav-current">
        <div className="nav-icon">
          {getDirectionIcon(currentInstruction.type)}
        </div>
        <div className="nav-instruction">
          <div className="nav-distance-big">
            {distanceToNext !== null && distanceToNext < 500
              ? formatDistance(distanceToNext)
              : formatDistance(currentInstruction.distance)
            }
          </div>
          <div className="nav-text">{currentInstruction.text}</div>
        </div>
      </div>

      {/* Next instruction preview */}
      {nextInstruction && !isLastStep && (
        <div className="nav-next">
          <span className="nav-next-label">Then</span>
          <span className="nav-next-icon">{getDirectionIcon(nextInstruction.type)}</span>
          <span className="nav-next-text">{nextInstruction.text}</span>
          <span className="nav-next-dist">{formatDistance(nextInstruction.distance)}</span>
        </div>
      )}

      {/* Arrival message */}
      {isLastStep && (
        <div className="nav-arrival">
          🎉 You have arrived at your destination!
        </div>
      )}

      {/* Navigation controls */}
      <div className="nav-controls">
        <button
          className="nav-btn nav-prev"
          onClick={handlePrevStep}
          disabled={currentStep === 0}
          aria-label="Previous step"
        >
          ◀
        </button>
        <div className="nav-step-counter">
          {currentStep + 1} / {instructions.length}
        </div>
        <button
          className="nav-btn nav-next-btn"
          onClick={handleNextStep}
          disabled={isLastStep}
          aria-label="Next step"
        >
          ▶
        </button>
      </div>
    </div>
  )
}

export default NavigationMode
