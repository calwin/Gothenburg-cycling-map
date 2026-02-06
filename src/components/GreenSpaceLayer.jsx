import { useEffect, useState } from 'react'
import { useMap, GeoJSON } from 'react-leaflet'
import axios from 'axios'

// Cache configuration
const CACHE_KEY = 'gothenburg-green-spaces-cache'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

// Gothenburg bounding box
const GOTHENBURG_BBOX = {
  south: 57.65,
  west: 11.85,
  north: 57.78,
  east: 12.05
}

// Overpass API query for parks and green spaces in Gothenburg
const buildOverpassQuery = () => {
  const bbox = `${GOTHENBURG_BBOX.south},${GOTHENBURG_BBOX.west},${GOTHENBURG_BBOX.north},${GOTHENBURG_BBOX.east}`

  return `
    [out:json][timeout:25];
    (
      // Parks
      way["leisure"="park"](${bbox});
      relation["leisure"="park"](${bbox});
      // Gardens
      way["leisure"="garden"](${bbox});
      // Nature reserves
      way["leisure"="nature_reserve"](${bbox});
      // Recreation grounds
      way["landuse"="recreation_ground"](${bbox});
      // Forests
      way["landuse"="forest"](${bbox});
      // Meadows
      way["landuse"="meadow"](${bbox});
      // Grass areas (larger ones only)
      way["landuse"="grass"](${bbox});
    );
    out body;
    >;
    out skel qt;
  `
}

// Convert Overpass response to GeoJSON
const overpassToGeoJSON = (data) => {
  const nodes = {}
  const ways = []
  const relations = []

  // Index nodes by ID
  data.elements.forEach(element => {
    if (element.type === 'node') {
      nodes[element.id] = [element.lon, element.lat]
    } else if (element.type === 'way') {
      ways.push(element)
    } else if (element.type === 'relation') {
      relations.push(element)
    }
  })

  // Convert ways to GeoJSON features
  const features = ways
    .filter(way => way.nodes && way.tags)
    .map(way => {
      const coordinates = way.nodes
        .map(nodeId => nodes[nodeId])
        .filter(coord => coord !== undefined)

      // Close the polygon if needed
      if (coordinates.length > 0 &&
          (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
           coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
        coordinates.push(coordinates[0])
      }

      if (coordinates.length < 4) return null

      return {
        type: 'Feature',
        properties: {
          name: way.tags.name || 'Green Space',
          type: way.tags.leisure || way.tags.landuse || 'green',
          ...way.tags
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        }
      }
    })
    .filter(feature => feature !== null)

  return {
    type: 'FeatureCollection',
    features
  }
}

// Cache management functions
const getFromCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const age = Date.now() - timestamp

    if (age > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    return data
  } catch (e) {
    console.error('Cache read error:', e)
    return null
  }
}

const saveToCache = (data) => {
  try {
    const cacheEntry = {
      data,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry))
  } catch (e) {
    console.error('Cache write error:', e)
    // If storage is full, try to clear old items
    if (e.name === 'QuotaExceededError') {
      localStorage.removeItem(CACHE_KEY)
    }
  }
}

// Style function for green spaces - subtle, non-distracting
const greenSpaceStyle = (feature) => {
  const type = feature.properties.type

  const styles = {
    park: {
      fillColor: '#a8d5a2',
      fillOpacity: 0.25,
      color: '#6b9b64',
      weight: 1
    },
    garden: {
      fillColor: '#a8d5a2',
      fillOpacity: 0.2,
      color: '#6b9b64',
      weight: 1
    },
    nature_reserve: {
      fillColor: '#8bc48a',
      fillOpacity: 0.2,
      color: '#5a8a54',
      weight: 1
    },
    forest: {
      fillColor: '#7ab87a',
      fillOpacity: 0.2,
      color: '#4a7a44',
      weight: 1
    },
    recreation_ground: {
      fillColor: '#a8d5a2',
      fillOpacity: 0.2,
      color: '#6b9b64',
      weight: 1
    },
    meadow: {
      fillColor: '#c4e6c0',
      fillOpacity: 0.2,
      color: '#8bc48a',
      weight: 1
    },
    grass: {
      fillColor: '#c4e6c0',
      fillOpacity: 0.15,
      color: '#8bc48a',
      weight: 1
    }
  }

  return styles[type] || styles.park
}

// Popup for each green space
const onEachFeature = (feature, layer) => {
  if (feature.properties && feature.properties.name) {
    const type = feature.properties.type
    const typeEmoji = {
      park: '🌳',
      garden: '🌺',
      nature_reserve: '🦌',
      forest: '🌲',
      recreation_ground: '⚽',
      meadow: '🌾',
      grass: '🌿'
    }

    layer.bindPopup(`
      <strong>${typeEmoji[type] || '🌳'} ${feature.properties.name}</strong>
      <br/>
      <small>${type.replace('_', ' ')}</small>
    `)
  }
}

function GreenSpaceLayer() {
  const [geoJsonData, setGeoJsonData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const map = useMap()

  useEffect(() => {
    const fetchGreenSpaces = async () => {
      // Try to get from cache first
      const cachedData = getFromCache()
      if (cachedData) {
        setGeoJsonData(cachedData)
        setIsLoading(false)
        return
      }

      // Fetch from API
      try {
        const query = buildOverpassQuery()
        const response = await axios.post(
          'https://overpass-api.de/api/interpreter',
          query,
          {
            headers: {
              'Content-Type': 'text/plain'
            },
            timeout: 30000 // 30 second timeout
          }
        )

        const geoJson = overpassToGeoJSON(response.data)
        setGeoJsonData(geoJson)

        // Save to cache for future use
        saveToCache(geoJson)
      } catch (error) {
        console.error('Failed to fetch green spaces:', error)
        setError('Failed to load green spaces')

        // Try to use stale cache as fallback
        try {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const { data } = JSON.parse(cached)
            setGeoJsonData(data)
          }
        } catch (e) {
          // No fallback available
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchGreenSpaces()
  }, [])

  if (isLoading || !geoJsonData) {
    return null
  }

  return (
    <GeoJSON
      key={geoJsonData.features.length} // Force re-render when data changes
      data={geoJsonData}
      style={greenSpaceStyle}
      onEachFeature={onEachFeature}
    />
  )
}

export default GreenSpaceLayer
