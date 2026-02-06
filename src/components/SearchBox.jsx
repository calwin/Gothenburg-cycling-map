import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import * as ors from '../services/openRouteService'

// Gothenburg center for biasing results
const GOTHENBURG_CENTER = {
  lat: 57.7089,
  lng: 11.9746
}

function SearchBox({ id, placeholder, value, onSelect }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)

  // Update input when value changes from map click
  useEffect(() => {
    if (value && value.address) {
      setQuery(value.address)
    } else if (value) {
      setQuery(`${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`)
    } else {
      setQuery('')
    }
  }, [value])

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false)
        setSelectedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search using Photon (best for autocomplete) with Nominatim fallback
  const searchLocation = async (searchQuery) => {
    if (searchQuery.length < 2) {
      setSuggestions([])
      return
    }

    setIsLoading(true)

    try {
      let results = []

      // Try Photon first - it's designed for autocomplete and much better at streets
      try {
        results = await searchPhoton(searchQuery)
      } catch (e) {
        console.log('Photon failed, trying Nominatim')
      }

      // Fallback to Nominatim if no results
      if (results.length === 0) {
        results = await searchNominatim(searchQuery)
      }

      setSuggestions(results)
      setSelectedIndex(-1)
    } catch (error) {
      console.error('Search error:', error)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }

  // Photon geocoder - much better for street autocomplete
  const searchPhoton = async (searchQuery) => {
    const response = await axios.get('https://photon.komoot.io/api/', {
      params: {
        q: searchQuery,
        lat: GOTHENBURG_CENTER.lat,
        lon: GOTHENBURG_CENTER.lng,
        limit: 8,
        lang: 'en'
      }
    })

    if (response.data.features && response.data.features.length > 0) {
      return response.data.features
        .map(feature => {
          const props = feature.properties
          const coords = feature.geometry.coordinates

          // Format the address nicely
          const parts = []
          if (props.name) parts.push(props.name)
          if (props.street && props.street !== props.name) {
            parts.push(props.housenumber ? `${props.street} ${props.housenumber}` : props.street)
          }
          if (props.district) parts.push(props.district)
          if (props.city && props.city !== 'Göteborg' && props.city !== 'Gothenburg') {
            parts.push(props.city)
          }

          const name = parts.length > 0 ? parts.join(', ') : props.name || 'Unknown'

          return {
            name,
            lat: coords[1],
            lng: coords[0],
            type: props.osm_value || props.type
          }
        })
        .filter(r => {
          // Filter to Gothenburg area (within ~30km)
          const dist = getDistance(r.lat, r.lng, GOTHENBURG_CENTER.lat, GOTHENBURG_CENTER.lng)
          return dist < 30
        })
    }

    return []
  }

  // Nominatim search (fallback)
  const searchNominatim = async (searchQuery) => {
    // Try multiple search strategies
    const searches = [
      // Search with city context
      { q: `${searchQuery}, Göteborg, Sweden` },
      // Search as street address
      { street: searchQuery, city: 'Göteborg', country: 'Sweden' },
    ]

    for (const params of searches) {
      try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: {
            ...params,
            format: 'json',
            limit: 8,
            addressdetails: 1,
            // Bias towards Gothenburg but don't strictly bound
            viewbox: '11.7,57.9,12.3,57.5',
            bounded: 0, // Don't strictly bound - allow nearby results
          },
          headers: {
            'User-Agent': 'GothenburgGreenRoutes/1.0'
          }
        })

        if (response.data.length > 0) {
          // Filter and sort results - prefer Gothenburg area
          const results = response.data
            .map(item => {
              const dist = getDistance(
                parseFloat(item.lat),
                parseFloat(item.lon),
                GOTHENBURG_CENTER.lat,
                GOTHENBURG_CENTER.lng
              )
              return {
                name: formatAddress(item),
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                distance: dist
              }
            })
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 6)

          if (results.length > 0) {
            return results
          }
        }
      } catch (e) {
        console.error('Nominatim search failed:', e)
      }
    }

    return []
  }

  // Format address to be more readable
  const formatAddress = (item) => {
    const addr = item.address || {}
    const parts = []

    // Street name and number
    if (addr.road) {
      parts.push(addr.road + (addr.house_number ? ' ' + addr.house_number : ''))
    } else if (item.display_name) {
      // Use first part of display name
      const firstPart = item.display_name.split(',')[0]
      parts.push(firstPart)
    }

    // Neighborhood/suburb
    if (addr.suburb || addr.neighbourhood) {
      parts.push(addr.suburb || addr.neighbourhood)
    }

    // City (skip if it's Gothenburg since that's obvious)
    if (addr.city && addr.city !== 'Göteborg' && addr.city !== 'Gothenburg') {
      parts.push(addr.city)
    }

    return parts.join(', ') || item.display_name
  }

  // Calculate distance between two points (for sorting)
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  const handleInputChange = (e) => {
    const newQuery = e.target.value
    setQuery(newQuery)
    setShowSuggestions(true)

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      searchLocation(newQuery)
    }, 300)
  }

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.name)
    setShowSuggestions(false)
    setSelectedIndex(-1)
    onSelect({
      lat: suggestion.lat,
      lng: suggestion.lng,
      address: suggestion.name
    })
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex])
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break
    }
  }

  // Clear input button
  const handleClear = () => {
    setQuery('')
    setSuggestions([])
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="search-input-wrapper" ref={wrapperRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="search-input"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={`${id}-suggestions`}
        aria-expanded={showSuggestions && suggestions.length > 0}
      />

      {/* Clear button */}
      {query && (
        <button
          className="search-clear-btn"
          onClick={handleClear}
          type="button"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}

      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div
          id={`${id}-suggestions`}
          className="search-suggestions"
          role="listbox"
        >
          {isLoading ? (
            <div className="loading">
              <div className="spinner"></div>
              Searching...
            </div>
          ) : (
            suggestions.map((suggestion, index) => (
              <div
                key={index}
                className={`suggestion-item ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => handleSuggestionClick(suggestion)}
                role="option"
                aria-selected={selectedIndex === index}
              >
                <span className="suggestion-icon">📍</span>
                <span className="suggestion-text">{suggestion.name}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SearchBox
