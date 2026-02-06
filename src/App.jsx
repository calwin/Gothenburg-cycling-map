import { useState, useCallback, useEffect } from 'react'
import Map from './components/Map'
import Controls from './components/Controls'
import NavigationMode from './components/NavigationMode'
import { useRouteSharing } from './hooks/useRouteSharing'
import { useDarkMode } from './hooks/useDarkMode'
import './App.css'

function App() {
  const [mode, setMode] = useState('cycling') // 'cycling' or 'walking'
  const [routeType, setRouteType] = useState('scenic') // 'scenic' or 'shortest'
  const [startPoint, setStartPoint] = useState(null)
  const [endPoint, setEndPoint] = useState(null)
  const [routeInfo, setRouteInfo] = useState(null)
  const [showGreenSpaces, setShowGreenSpaces] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCopiedToast, setShowCopiedToast] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [userLocation, setUserLocation] = useState(null)

  // Dark mode hook
  const { isDark, toggle: toggleDarkMode } = useDarkMode()

  // Route sharing hook
  const { copyShareUrl, hasRoute } = useRouteSharing({
    startPoint,
    endPoint,
    mode,
    onLoadRoute: useCallback((route) => {
      setStartPoint(route.startPoint)
      setEndPoint(route.endPoint)
      setMode(route.mode)
    }, [])
  })

  // Handle share button click
  const handleShare = async () => {
    const success = await copyShareUrl()
    if (success) {
      setShowCopiedToast(true)
      setTimeout(() => setShowCopiedToast(false), 2000)
    }
  }

  const handleMapClick = useCallback((latlng) => {
    setError(null)
    if (!startPoint) {
      setStartPoint(latlng)
      setRouteInfo(null)
    } else if (!endPoint) {
      setEndPoint(latlng)
    } else {
      // Reset and start new route
      setStartPoint(latlng)
      setEndPoint(null)
      setRouteInfo(null)
    }
  }, [startPoint, endPoint])

  const handleClearRoute = useCallback(() => {
    setStartPoint(null)
    setEndPoint(null)
    setRouteInfo(null)
    setError(null)
  }, [])

  const handleRouteFound = useCallback((info) => {
    setRouteInfo(info)
    setIsLoading(false)
    setError(null)
  }, [])

  const handleRouteError = useCallback((errorMsg) => {
    setError(errorMsg)
    setIsLoading(false)
    setRouteInfo(null)
  }, [])

  const handleRoutingStart = useCallback(() => {
    setIsLoading(true)
    setError(null)
  }, [])

  const handleStartSelected = useCallback((location) => {
    setStartPoint(location)
    setRouteInfo(null)
    setError(null)
  }, [])

  const handleEndSelected = useCallback((location) => {
    setEndPoint(location)
    setError(null)
  }, [])

  // Handle selecting a favorite location
  const handleFavoriteSelect = useCallback((location, asStart) => {
    if (asStart) {
      setStartPoint(location)
    } else {
      setEndPoint(location)
    }
    setError(null)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case 'Escape':
          handleClearRoute()
          break
        case 'd':
        case 'D':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            toggleDarkMode()
          }
          break
        case 'c':
        case 'C':
          if (!e.ctrlKey && !e.metaKey) {
            setMode('cycling')
          }
          break
        case 'w':
        case 'W':
          if (!e.ctrlKey && !e.metaKey) {
            setMode('walking')
          }
          break
        case 'g':
        case 'G':
          setShowGreenSpaces(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClearRoute, toggleDarkMode])

  return (
    <div className={`app ${isNavigating ? 'navigating' : ''}`}>
      <header className="header">
        <h1>
          {mode === 'cycling' ? '🚴' : '🚶'} Gothenburg Green Routes
        </h1>
        <div className="header-actions">
          {hasRoute && (
            <button
              className="header-btn"
              onClick={handleShare}
              title="Copy shareable link"
              aria-label="Share route"
            >
              🔗 Share
            </button>
          )}
          <button
            className="header-btn"
            onClick={toggleDarkMode}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Toast notification */}
      {showCopiedToast && (
        <div className="toast" role="alert">
          ✓ Link copied to clipboard!
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      <div className="map-container">
        <Controls
          mode={mode}
          onModeChange={setMode}
          routeType={routeType}
          onRouteTypeChange={setRouteType}
          startPoint={startPoint}
          endPoint={endPoint}
          routeInfo={routeInfo}
          showGreenSpaces={showGreenSpaces}
          onToggleGreenSpaces={setShowGreenSpaces}
          onClearRoute={handleClearRoute}
          onStartSelected={handleStartSelected}
          onEndSelected={handleEndSelected}
          onFavoriteSelect={handleFavoriteSelect}
          isLoading={isLoading}
          isDark={isDark}
          onStartNavigation={() => setIsNavigating(true)}
        />
        <Map
          mode={mode}
          routeType={routeType}
          startPoint={startPoint}
          endPoint={endPoint}
          showGreenSpaces={showGreenSpaces}
          onMapClick={handleMapClick}
          onRouteFound={handleRouteFound}
          onRouteError={handleRouteError}
          onRoutingStart={handleRoutingStart}
          isDark={isDark}
          isNavigating={isNavigating}
          onLocationUpdate={setUserLocation}
        />
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-overlay" aria-live="polite">
          <div className="loading-content">
            <div className="spinner large"></div>
            <span>Calculating route...</span>
          </div>
        </div>
      )}

      {/* Navigation Mode */}
      {isNavigating && routeInfo && (
        <NavigationMode
          routeInfo={routeInfo}
          userLocation={userLocation}
          onClose={() => setIsNavigating(false)}
          onReroute={(loc) => {
            setStartPoint({ lat: loc.lat, lng: loc.lng, address: 'My Location' })
          }}
        />
      )}
    </div>
  )
}

export default App
