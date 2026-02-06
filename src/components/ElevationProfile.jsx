import { useEffect, useRef } from 'react'

function ElevationProfile({ routeInfo, isExpanded, onToggle }) {
  const canvasRef = useRef(null)

  const hasRealElevation = routeInfo?.elevation && routeInfo.elevation.length > 0
  const hasElevationStats = routeInfo?.ascent != null

  // Draw elevation profile
  useEffect(() => {
    if (!canvasRef.current || !isExpanded) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height

    // Get theme colors
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const bgColor = isDark ? '#16213e' : '#f8f9fa'
    const lineColor = isDark ? '#6b9b64' : '#2d5a27'
    const fillColor = isDark ? 'rgba(107, 155, 100, 0.3)' : 'rgba(45, 90, 39, 0.2)'
    const gridColor = isDark ? '#333355' : '#e0e0e0'
    const textColor = isDark ? '#b0b0b0' : '#666666'

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    const padding = { top: 15, bottom: 25, left: 35, right: 10 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    if (hasRealElevation) {
      // Real elevation data from OpenRouteService
      const elevationData = routeInfo.elevation
      const elevations = elevationData.map(p => p.elevation)
      const distances = elevationData.map(p => p.distance)

      const minElev = Math.min(...elevations)
      const maxElev = Math.max(...elevations)
      const maxDist = Math.max(...distances)

      // Add some padding to elevation range
      const elevRange = maxElev - minElev || 10
      const elevMin = minElev - elevRange * 0.1
      const elevMax = maxElev + elevRange * 0.1

      // Draw grid
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 2])

      // Horizontal grid lines (elevation)
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i
        ctx.beginPath()
        ctx.moveTo(padding.left, y)
        ctx.lineTo(width - padding.right, y)
        ctx.stroke()
      }

      ctx.setLineDash([])

      // Draw elevation labels
      ctx.fillStyle = textColor
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'

      for (let i = 0; i <= 4; i++) {
        const elev = elevMax - ((elevMax - elevMin) / 4) * i
        const y = padding.top + (chartHeight / 4) * i
        ctx.fillText(`${Math.round(elev)}m`, padding.left - 5, y + 3)
      }

      // Draw distance labels
      ctx.textAlign = 'center'
      const distLabels = [0, maxDist / 2, maxDist]
      distLabels.forEach((dist, i) => {
        const x = padding.left + (chartWidth / 2) * i
        const label = dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`
        ctx.fillText(label, x, height - 5)
      })

      // Calculate points
      const points = elevationData.map(p => ({
        x: padding.left + (p.distance / maxDist) * chartWidth,
        y: padding.top + (1 - (p.elevation - elevMin) / (elevMax - elevMin)) * chartHeight
      }))

      // Draw filled area
      ctx.beginPath()
      ctx.moveTo(padding.left, padding.top + chartHeight)
      points.forEach(p => ctx.lineTo(p.x, p.y))
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight)
      ctx.closePath()
      ctx.fillStyle = fillColor
      ctx.fill()

      // Draw line
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      points.forEach(p => ctx.lineTo(p.x, p.y))
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 2
      ctx.stroke()

    } else {
      // Placeholder when no real elevation data
      ctx.fillStyle = textColor
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Elevation data requires OpenRouteService API', width / 2, height / 2 - 10)
      ctx.font = '10px sans-serif'
      ctx.fillText('Add VITE_ORS_API_KEY to .env', width / 2, height / 2 + 10)
    }

  }, [isExpanded, routeInfo, hasRealElevation])

  if (!routeInfo) return null

  // Calculate stats
  const stats = hasElevationStats ? {
    ascent: routeInfo.ascent,
    descent: routeInfo.descent,
    avgGrade: ((routeInfo.ascent / (routeInfo.distance || 1)) * 100).toFixed(1)
  } : {
    // Estimate for Gothenburg (relatively flat)
    ascent: Math.round((routeInfo.distance / 1000) * 8),
    descent: Math.round((routeInfo.distance / 1000) * 7),
    avgGrade: '0.8',
    estimated: true
  }

  return (
    <div className="elevation-panel">
      <button
        className="elevation-header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className="elevation-title">
          ⛰️ Elevation Profile
        </span>
        <span className={`elevation-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="elevation-content">
          <canvas
            ref={canvasRef}
            width={280}
            height={120}
            className="elevation-canvas"
          />

          <div className="elevation-stats">
            <div className="elevation-stat">
              <span className="stat-label">{stats.estimated ? 'Est. ' : ''}Gain</span>
              <span className="stat-value">↑ {Math.round(stats.ascent)}m</span>
            </div>
            <div className="elevation-stat">
              <span className="stat-label">{stats.estimated ? 'Est. ' : ''}Loss</span>
              <span className="stat-value">↓ {Math.round(stats.descent)}m</span>
            </div>
            <div className="elevation-stat">
              <span className="stat-label">Avg Grade</span>
              <span className="stat-value">{stats.avgGrade}%</span>
            </div>
          </div>

          {stats.estimated && (
            <div className="elevation-note">
              <small>* Estimates based on typical Gothenburg terrain</small>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ElevationProfile
