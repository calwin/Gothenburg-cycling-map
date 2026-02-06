import { useState, useEffect } from 'react'
import * as ratingService from '../services/routeRatingService'

function RouteRating({ startPoint, endPoint, mode, routeType, distance }) {
  const [userRating, setUserRating] = useState(null)
  const [showThanks, setShowThanks] = useState(false)

  // Load existing rating when route changes
  useEffect(() => {
    if (startPoint && endPoint) {
      const existing = ratingService.getUserRating(startPoint, endPoint, mode, routeType)
      setUserRating(existing)
      setShowThanks(false)
    }
  }, [startPoint, endPoint, mode, routeType])

  const handleRate = (isPositive) => {
    const result = ratingService.rateRoute({
      start: startPoint,
      end: endPoint,
      mode,
      routeType,
      distance
    }, isPositive)

    setUserRating(result.userRating)

    // Show thanks message briefly
    if (result.userRating) {
      setShowThanks(true)
      setTimeout(() => setShowThanks(false), 2000)
    }
  }

  if (!startPoint || !endPoint) {
    return null
  }

  return (
    <div className="route-rating">
      <span className="rating-label">Rate this route:</span>
      <div className="rating-buttons">
        <button
          className={`rating-btn thumbs-up ${userRating === 'up' ? 'active' : ''}`}
          onClick={() => handleRate(true)}
          title="Good route"
          aria-label="Rate route positively"
          aria-pressed={userRating === 'up'}
        >
          👍
        </button>
        <button
          className={`rating-btn thumbs-down ${userRating === 'down' ? 'active' : ''}`}
          onClick={() => handleRate(false)}
          title="Could be better"
          aria-label="Rate route negatively"
          aria-pressed={userRating === 'down'}
        >
          👎
        </button>
      </div>
      {showThanks && (
        <span className="rating-thanks">Thanks for your feedback!</span>
      )}
    </div>
  )
}

export default RouteRating
