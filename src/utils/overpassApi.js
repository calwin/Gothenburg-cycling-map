import axios from 'axios'

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter'

/**
 * Build Overpass QL query for green spaces within a bounding box
 * @param {Object} bbox - Bounding box {south, west, north, east}
 * @returns {string} Overpass QL query
 */
export const buildGreenSpacesQuery = (bbox) => {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`

  return `
    [out:json][timeout:25];
    (
      way["leisure"="park"](${bboxStr});
      relation["leisure"="park"](${bboxStr});
      way["leisure"="garden"](${bboxStr});
      way["leisure"="nature_reserve"](${bboxStr});
      way["landuse"="recreation_ground"](${bboxStr});
      way["landuse"="forest"](${bboxStr});
      way["landuse"="meadow"](${bboxStr});
      way["landuse"="grass"](${bboxStr});
    );
    out body;
    >;
    out skel qt;
  `
}

/**
 * Build Overpass QL query for bike infrastructure
 * @param {Object} bbox - Bounding box {south, west, north, east}
 * @returns {string} Overpass QL query
 */
export const buildBikeInfrastructureQuery = (bbox) => {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`

  return `
    [out:json][timeout:25];
    (
      way["highway"="cycleway"](${bboxStr});
      way["bicycle"="designated"](${bboxStr});
      way["cycleway"](${bboxStr});
    );
    out body;
    >;
    out skel qt;
  `
}

/**
 * Execute Overpass API query
 * @param {string} query - Overpass QL query
 * @returns {Promise<Object>} Overpass response data
 */
export const executeOverpassQuery = async (query) => {
  try {
    const response = await axios.post(OVERPASS_API_URL, query, {
      headers: {
        'Content-Type': 'text/plain'
      }
    })
    return response.data
  } catch (error) {
    console.error('Overpass API error:', error)
    throw error
  }
}

/**
 * Convert Overpass response to GeoJSON FeatureCollection
 * @param {Object} data - Overpass API response
 * @returns {Object} GeoJSON FeatureCollection
 */
export const overpassToGeoJSON = (data) => {
  const nodes = {}
  const ways = []

  // Index nodes
  data.elements.forEach(element => {
    if (element.type === 'node') {
      nodes[element.id] = [element.lon, element.lat]
    } else if (element.type === 'way') {
      ways.push(element)
    }
  })

  // Convert ways to features
  const features = ways
    .filter(way => way.nodes && way.tags)
    .map(way => {
      const coordinates = way.nodes
        .map(nodeId => nodes[nodeId])
        .filter(Boolean)

      if (coordinates.length < 2) return null

      // Determine geometry type
      const isPolygon = way.tags.leisure || way.tags.landuse
      const isClosed = coordinates.length > 2 &&
        coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
        coordinates[0][1] === coordinates[coordinates.length - 1][1]

      if (isPolygon && !isClosed && coordinates.length > 2) {
        coordinates.push(coordinates[0])
      }

      return {
        type: 'Feature',
        properties: {
          id: way.id,
          ...way.tags
        },
        geometry: {
          type: isPolygon && coordinates.length > 3 ? 'Polygon' : 'LineString',
          coordinates: isPolygon && coordinates.length > 3 ? [coordinates] : coordinates
        }
      }
    })
    .filter(Boolean)

  return {
    type: 'FeatureCollection',
    features
  }
}
