import { useEffect, useRef, useState } from 'react'

interface Props {
  onLocationSelect: (latitud: number, longitud: number) => void
}

export default function LocationPickerMap({ onLocationSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient || !mapRef.current) return

    // Solo importa Leaflet en el cliente, no en SSR
    import('leaflet').then(L => {
      import('leaflet/dist/leaflet.css')
      
      const map = L.map(mapRef.current!).setView([19.0414, -98.2063], 13)
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map)

      const marker = L.marker([19.0414, -98.2063], { draggable: true }).addTo(map)
      
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onLocationSelect(pos.lat, pos.lng)
      })

      map.on('click', (e) => {
        marker.setLatLng(e.latlng)
        onLocationSelect(e.latlng.lat, e.latlng.lng)
      })

      return () => {
        map.remove()
      }
    })
  }, [isClient])

  if (!isClient) return <div style={{ width: '100%', height: '300px', backgroundColor: '#E5E7EB' }} />

  return <div ref={mapRef} style={{ width: '100%', height: '300px', borderRadius: '12px' }} />
}