import SearchBox from './SearchBox'
import Directions from './Directions'
import Favorites from './Favorites'
import ElevationProfile from './ElevationProfile'
import RouteRating from './RouteRating'
import { useState } from 'react'

// Route type configurations - different descriptions based on mode
// Cycling uses Valhalla (better bike path preference with use_roads parameter)
const ROUTE_TYPES_CYCLING = [
  { id: 'scenic', label: '🌳 Scenic', description: 'Prefer bike paths & trails' },
  { id: 'quiet', label: '🔇 Quiet', description: 'Residential streets' },
  { id: 'safe', label: '🛡️ Easy', description: 'Flat, paved routes' },
  { id: 'shortest', label: '⚡ Shortest', description: 'Fastest route' },
]

const ROUTE_TYPES_WALKING = [
  { id: 'scenic', label: '🌳 Scenic', description: 'Parks & green areas' },
  { id: 'quiet', label: '🔇 Quiet', description: 'Avoid noisy areas' },
  { id: 'safe', label: '🛡️ Accessible', description: 'No steps, easy terrain' },
  { id: 'shortest', label: '⚡ Shortest', description: 'Minimum distance' },
]

// CO2 calculation: average car emits ~120g CO2/km
const CO2_PER_KM_CAR = 120 // grams

function Controls({
  mode,
  onModeChange,
  routeType,
  onRouteTypeChange,
  startPoint,
  endPoint,
  routeInfo,
  showGreenSpaces,
  onToggleGreenSpaces,
  onClearRoute,
  onStartSelected,
  onEndSelected,
  onFavoriteSelect,
  isLoading,
  isDark,
  onStartNavigation
}) {
  const [showDirections, setShowDirections] = useState(false)
  const [showElevation, setShowElevation] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [showRouteTypes, setShowRouteTypes] = useState(false)

  const formatDistance = (meters) => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`
    }
    return `${(meters / 1000).toFixed(1)} km`
  }

  const formatDuration = (seconds) => {
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) {
      return `${minutes} min`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}min`
  }

  // Calculate CO2 saved vs driving
  const calculateCO2Saved = (meters) => {
    const km = meters / 1000
    const grams = km * CO2_PER_KM_CAR
    if (grams >= 1000) {
      return `${(grams / 1000).toFixed(1)} kg`
    }
    return `${Math.round(grams)} g`
  }

  // Export route as GPX
  const exportGPX = () => {
    if (!routeInfo?.geometry) return

    const coordinates = routeInfo.geometry.coordinates
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Gothenburg Green Routes">
  <metadata>
    <name>Route from Gothenburg Green Routes</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${mode === 'cycling' ? 'Cycling' : 'Walking'} Route (${routeType})</name>
    <trkseg>
${coordinates.map(coord => `      <trkpt lat="${coord[1]}" lon="${coord[0]}"${coord[2] ? ` ele="${coord[2]}"` : ''}></trkpt>`).join('\n')}
    </trkseg>
  </trk>
</gpx>`

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gothenburg-${mode}-route.gpx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Mobile minimize toggle
  const toggleMinimize = () => {
    setIsMinimized(!isMinimized)
  }

  const ROUTE_TYPES = mode === 'cycling' ? ROUTE_TYPES_CYCLING : ROUTE_TYPES_WALKING
  const currentRouteType = ROUTE_TYPES.find(rt => rt.id === routeType) || ROUTE_TYPES[0]

  return (
    <div className={`controls-panel ${isMinimized ? 'minimized' : ''}`}>
      {/* Mobile toggle bar */}
      <div className="controls-mobile-toggle" onClick={toggleMinimize}>
        <span className="toggle-bar"></span>
      </div>

      {/* Mode Toggle */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${mode === 'cycling' ? 'active' : ''}`}
          onClick={() => onModeChange('cycling')}
          aria-pressed={mode === 'cycling'}
        >
          🚴 Cycling
        </button>
        <button
          className={`mode-btn ${mode === 'walking' ? 'active' : ''}`}
          onClick={() => onModeChange('walking')}
          aria-pressed={mode === 'walking'}
        >
          🚶 Walking
        </button>
      </div>

      {/* Route Type Selector */}
      <div className="route-type-selector">
        <button
          className="route-type-dropdown"
          onClick={() => setShowRouteTypes(!showRouteTypes)}
          aria-expanded={showRouteTypes}
        >
          <span className="route-type-current">
            {currentRouteType.label}
          </span>
          <span className="route-type-desc">{currentRouteType.description}</span>
          <span className={`dropdown-arrow ${showRouteTypes ? 'open' : ''}`}>▼</span>
        </button>

        {showRouteTypes && (
          <div className="route-type-options">
            {ROUTE_TYPES.map(rt => (
              <button
                key={rt.id}
                className={`route-type-option ${routeType === rt.id ? 'active' : ''}`}
                onClick={() => {
                  onRouteTypeChange(rt.id)
                  setShowRouteTypes(false)
                }}
              >
                <span className="option-label">{rt.label}</span>
                <span className="option-desc">{rt.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!isMinimized && (
        <>
          {/* Search Boxes */}
          <div className="search-section">
            <label className="search-label" htmlFor="search-start">From</label>
            <SearchBox
              id="search-start"
              placeholder="Search start location or click map"
              value={startPoint}
              onSelect={onStartSelected}
              showMyLocation
            />
          </div>

          <div className="search-section">
            <label className="search-label" htmlFor="search-end">To</label>
            <SearchBox
              id="search-end"
              placeholder="Search destination or click map"
              value={endPoint}
              onSelect={onEndSelected}
            />
          </div>

          {/* Swap button */}
          {startPoint && endPoint && (
            <button
              className="swap-btn"
              onClick={() => {
                onStartSelected(endPoint)
                onEndSelected(startPoint)
              }}
              title="Swap start and destination"
              aria-label="Swap start and destination"
            >
              ⇅ Swap
            </button>
          )}

          {/* Route Info */}
          {routeInfo && (
            <div className="route-info">
              <h3>Route Details</h3>
              <div className="route-stats-grid">
                <div className="route-stat-item">
                  <span className="stat-icon">📏</span>
                  <span className="stat-value">{formatDistance(routeInfo.distance)}</span>
                  <span className="stat-label">Distance</span>
                </div>
                <div className="route-stat-item">
                  <span className="stat-icon">⏱️</span>
                  <span className="stat-value">{formatDuration(routeInfo.duration)}</span>
                  <span className="stat-label">Duration</span>
                </div>
                <div className="route-stat-item">
                  <span className="stat-icon">🔥</span>
                  <span className="stat-value">
                    {Math.round(
                      mode === 'cycling'
                        ? (routeInfo.distance / 1000) * 30
                        : (routeInfo.distance / 1000) * 50
                    )}
                  </span>
                  <span className="stat-label">Calories</span>
                </div>
                <div className="route-stat-item co2-saved">
                  <span className="stat-icon">🌱</span>
                  <span className="stat-value">{calculateCO2Saved(routeInfo.distance)}</span>
                  <span className="stat-label">CO₂ saved</span>
                </div>
              </div>

              {/* Elevation stats if available */}
              {(routeInfo.ascent != null || routeInfo.descent != null) && (
                <div className="elevation-summary">
                  {routeInfo.ascent != null && (
                    <span className="elev-stat">↑ {Math.round(routeInfo.ascent)}m</span>
                  )}
                  {routeInfo.descent != null && (
                    <span className="elev-stat">↓ {Math.round(routeInfo.descent)}m</span>
                  )}
                </div>
              )}

              {/* Export GPX button */}
              {routeInfo.geometry && (
                <button className="btn btn-sm btn-outline gpx-btn" onClick={exportGPX}>
                  📥 Export GPX
                </button>
              )}

              {/* Route Rating */}
              <RouteRating
                startPoint={startPoint}
                endPoint={endPoint}
                mode={mode}
                routeType={routeType}
                distance={routeInfo.distance}
              />

              {/* Start Navigation Button */}
              {routeInfo.instructions && onStartNavigation && (
                <button className="start-nav-btn" onClick={onStartNavigation}>
                  🧭 Start Navigation
                </button>
              )}
            </div>
          )}

          {/* Turn-by-turn directions */}
          {routeInfo?.instructions && (
            <Directions
              instructions={routeInfo.instructions}
              isExpanded={showDirections}
              onToggle={() => setShowDirections(!showDirections)}
            />
          )}

          {/* Elevation profile */}
          {routeInfo && (
            <ElevationProfile
              routeInfo={routeInfo}
              isExpanded={showElevation}
              onToggle={() => setShowElevation(!showElevation)}
            />
          )}

          {/* Action Buttons */}
          {(startPoint || endPoint) && (
            <div className="action-buttons">
              <button
                className="btn btn-secondary"
                onClick={onClearRoute}
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Clear Route'}
              </button>
            </div>
          )}

          {/* Favorites Section */}
          <Favorites
            onSelectLocation={onFavoriteSelect}
            startPoint={startPoint}
            endPoint={endPoint}
          />

          {/* Green Spaces Toggle */}
          <div className="toggle-section">
            <span className="toggle-label">
              🌳 Show Parks & Green Spaces
            </span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={showGreenSpaces}
                onChange={(e) => onToggleGreenSpaces(e.target.checked)}
                aria-label="Toggle green spaces visibility"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {/* Instructions */}
          {!startPoint && (
            <div className="instructions">
              <p><strong>How to use:</strong></p>
              <p>1. Click on the map to set your start point</p>
              <p>2. Click again to set your destination</p>
              <p>3. Choose your preferred route type</p>
              <div className="keyboard-shortcuts">
                <p><strong>Keyboard shortcuts:</strong></p>
                <p><kbd>C</kbd> Cycling mode</p>
                <p><kbd>W</kbd> Walking mode</p>
                <p><kbd>G</kbd> Toggle green spaces</p>
                <p><kbd>Esc</kbd> Clear route</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Controls
