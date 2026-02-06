import { useState } from 'react'

// Map OSRM instruction types to icons
const getDirectionIcon = (type, modifier) => {
  const icons = {
    'depart': '🚀',
    'arrive': '🏁',
    'turn': modifier?.includes('left') ? '↰' : modifier?.includes('right') ? '↱' : '↑',
    'continue': '↑',
    'merge': '↗',
    'on ramp': '↗',
    'off ramp': '↘',
    'fork': modifier?.includes('left') ? '↰' : '↱',
    'end of road': modifier?.includes('left') ? '↰' : '↱',
    'roundabout': '🔄',
    'rotary': '🔄',
    'roundabout turn': '🔄',
    'exit roundabout': '↗',
    'notification': 'ℹ️',
    'use lane': '↑'
  }
  return icons[type] || '↑'
}

const formatStepDistance = (meters) => {
  if (meters < 100) {
    return `${Math.round(meters)} m`
  }
  if (meters < 1000) {
    return `${Math.round(meters / 10) * 10} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

function Directions({ instructions, isExpanded, onToggle }) {
  const [expandedStep, setExpandedStep] = useState(null)

  if (!instructions || instructions.length === 0) {
    return null
  }

  return (
    <div className="directions-panel">
      <button
        className="directions-header"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls="directions-list"
      >
        <span className="directions-title">
          📋 Turn-by-turn directions
        </span>
        <span className={`directions-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div id="directions-list" className="directions-list" role="list">
          {instructions.map((step, index) => (
            <div
              key={index}
              className={`direction-step ${expandedStep === index ? 'expanded' : ''}`}
              onClick={() => setExpandedStep(expandedStep === index ? null : index)}
              role="listitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setExpandedStep(expandedStep === index ? null : index)
                }
              }}
            >
              <div className="step-icon">
                {getDirectionIcon(step.type, step.modifier)}
              </div>
              <div className="step-content">
                <div className="step-text">{step.text}</div>
                <div className="step-distance">
                  {formatStepDistance(step.distance)}
                </div>
              </div>
              <div className="step-number">{index + 1}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Directions
