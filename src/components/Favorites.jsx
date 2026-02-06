import { useState, useEffect } from 'react'

const STORAGE_KEY = 'gothenburg-green-routes-favorites'

function Favorites({ onSelectLocation, startPoint, endPoint }) {
  const [favorites, setFavorites] = useState([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [addingFor, setAddingFor] = useState(null) // 'start' or 'end'

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setFavorites(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Failed to load favorites:', e)
    }
  }, [])

  // Save favorites to localStorage
  const saveFavorites = (newFavorites) => {
    setFavorites(newFavorites)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites))
    } catch (e) {
      console.error('Failed to save favorites:', e)
    }
  }

  const handleAddFavorite = (type) => {
    const point = type === 'start' ? startPoint : endPoint
    if (!point) return

    setAddingFor(type)
    setNewName(point.address || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`)
    setShowAddForm(true)
  }

  const handleSaveFavorite = () => {
    if (!newName.trim() || !addingFor) return

    const point = addingFor === 'start' ? startPoint : endPoint
    if (!point) return

    const newFavorite = {
      id: Date.now(),
      name: newName.trim(),
      lat: point.lat,
      lng: point.lng
    }

    saveFavorites([...favorites, newFavorite])
    setShowAddForm(false)
    setNewName('')
    setAddingFor(null)
  }

  const handleDeleteFavorite = (id) => {
    saveFavorites(favorites.filter(f => f.id !== id))
  }

  const handleSelectFavorite = (favorite, asStart) => {
    onSelectLocation({
      lat: favorite.lat,
      lng: favorite.lng,
      address: favorite.name
    }, asStart)
  }

  return (
    <div className="favorites-section">
      <button
        className="favorites-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span>⭐ Favorites ({favorites.length})</span>
        <span className={`favorites-chevron ${isExpanded ? 'expanded' : ''}`}>▼</span>
      </button>

      {isExpanded && (
        <div className="favorites-content">
          {/* Add buttons */}
          <div className="favorites-add-buttons">
            {startPoint && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => handleAddFavorite('start')}
                title="Save start location"
              >
                + Save Start
              </button>
            )}
            {endPoint && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => handleAddFavorite('end')}
                title="Save destination"
              >
                + Save Dest
              </button>
            )}
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="favorites-add-form">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Location name"
                className="search-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveFavorite()
                  if (e.key === 'Escape') setShowAddForm(false)
                }}
              />
              <div className="favorites-form-buttons">
                <button className="btn btn-sm btn-primary" onClick={handleSaveFavorite}>
                  Save
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Favorites list */}
          {favorites.length === 0 ? (
            <div className="favorites-empty">
              No saved locations yet. Set a start or destination point and save it!
            </div>
          ) : (
            <div className="favorites-list">
              {favorites.map((favorite) => (
                <div key={favorite.id} className="favorite-item">
                  <span className="favorite-name" title={`${favorite.lat.toFixed(5)}, ${favorite.lng.toFixed(5)}`}>
                    📍 {favorite.name}
                  </span>
                  <div className="favorite-actions">
                    <button
                      className="favorite-action-btn"
                      onClick={() => handleSelectFavorite(favorite, true)}
                      title="Set as start"
                    >
                      🅰️
                    </button>
                    <button
                      className="favorite-action-btn"
                      onClick={() => handleSelectFavorite(favorite, false)}
                      title="Set as destination"
                    >
                      🅱️
                    </button>
                    <button
                      className="favorite-action-btn delete"
                      onClick={() => handleDeleteFavorite(favorite.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Favorites
