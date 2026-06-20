import { useEffect, useRef, useState } from 'react'

interface Props {
  onLocationSelect: (latitud: number, longitud: number) => void
  selectedPosition?: { latitud: number; longitud: number } | null
}

const DEFAULT_CENTER: [number, number] = [19.0414, -98.2063]

export default function LocationPickerMap({ onLocationSelect, selectedPosition }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerInstanceRef = useRef<any>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient || !mapRef.current) return

    import('leaflet').then(L => {
      import('leaflet/dist/leaflet.css')

      const startCenter: [number, number] = selectedPosition
        ? [selectedPosition.latitud, selectedPosition.longitud]
        : DEFAULT_CENTER

      const map = L.map(mapRef.current!).setView(startCenter, 15)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO'
      }).addTo(map)

      const pinIcon = L.divIcon({
        className: '',
        html: `<div style="
          background:#E74C3C;
          width:24px;
          height:24px;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:2px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      })

      const marker = L.marker(startCenter, { draggable: true, icon: pinIcon }).addTo(map)
      markerInstanceRef.current = marker

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

  useEffect(() => {
    if (!selectedPosition || !mapInstanceRef.current || !markerInstanceRef.current) return
    const { latitud, longitud } = selectedPosition
    mapInstanceRef.current.setView([latitud, longitud], 15)
    markerInstanceRef.current.setLatLng([latitud, longitud])
  }, [selectedPosition?.latitud, selectedPosition?.longitud])

  if (!isClient) return <div style={{ width: '100%', height: '300px', backgroundColor: '#E5E7EB' }} />

  return <div ref={mapRef} style={{ width: '100%', height: '300px', borderRadius: '12px' }} />
}