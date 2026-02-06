import { useEffect, useCallback } from 'react'

// Encode route data to URL-safe string
const encodeRoute = (startPoint, endPoint, mode) => {
  if (!startPoint || !endPoint) return null

  const data = {
    s: [startPoint.lat.toFixed(5), startPoint.lng.toFixed(5)],
    e: [endPoint.lat.toFixed(5), endPoint.lng.toFixed(5)],
    m: mode === 'walking' ? 'w' : 'c'
  }

  return btoa(JSON.stringify(data))
}

// Decode route data from URL-safe string
const decodeRoute = (encoded) => {
  try {
    const data = JSON.parse(atob(encoded))
    return {
      startPoint: {
        lat: parseFloat(data.s[0]),
        lng: parseFloat(data.s[1])
      },
      endPoint: {
        lat: parseFloat(data.e[0]),
        lng: parseFloat(data.e[1])
      },
      mode: data.m === 'w' ? 'walking' : 'cycling'
    }
  } catch (e) {
    console.error('Failed to decode route:', e)
    return null
  }
}

export function useRouteSharing({
  startPoint,
  endPoint,
  mode,
  onLoadRoute
}) {
  // Load route from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const routeParam = params.get('route')

    if (routeParam && onLoadRoute) {
      const route = decodeRoute(routeParam)
      if (route) {
        onLoadRoute(route)
      }
    }
  }, []) // Only run on mount

  // Update URL when route changes (without reloading)
  useEffect(() => {
    const encoded = encodeRoute(startPoint, endPoint, mode)

    if (encoded) {
      const url = new URL(window.location.href)
      url.searchParams.set('route', encoded)
      window.history.replaceState({}, '', url.toString())
    } else {
      // Clear route param if no route
      const url = new URL(window.location.href)
      url.searchParams.delete('route')
      window.history.replaceState({}, '', url.toString())
    }
  }, [startPoint, endPoint, mode])

  // Generate shareable URL
  const getShareUrl = useCallback(() => {
    const encoded = encodeRoute(startPoint, endPoint, mode)
    if (!encoded) return null

    const url = new URL(window.location.origin + window.location.pathname)
    url.searchParams.set('route', encoded)
    return url.toString()
  }, [startPoint, endPoint, mode])

  // Copy share URL to clipboard
  const copyShareUrl = useCallback(async () => {
    const url = getShareUrl()
    if (!url) return false

    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch (e) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      return true
    }
  }, [getShareUrl])

  return {
    getShareUrl,
    copyShareUrl,
    hasRoute: !!(startPoint && endPoint)
  }
}

export default useRouteSharing
