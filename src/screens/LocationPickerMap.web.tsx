import { useEffect, useRef, useState } from 'react'

interface Props {
  onLocationSelect: (latitud: number, longitud: number) => void
  selectedPosition?: { latitud: number; longitud: number } | null
  instructionText?: string
  helperText?: string
  readOnly?: boolean
}

const DEFAULT_CENTER: [number, number] = [19.0414, -98.2063]

// Pin naranja PawAlert — consistente con el resto de la app
const PIN_HTML = `
  <div style="display:flex;flex-direction:column;align-items:center;">
    <div style="
      width:38px; height:38px; border-radius:50%;
      background:#EC802B;
      border:3px solid #D4691A;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 4px 14px rgba(236,128,43,0.5);
      position:relative;
    ">
      <!-- Cruz de posicionamiento -->
      <div style="position:absolute;width:16px;height:2px;background:white;border-radius:1px;"></div>
      <div style="position:absolute;width:2px;height:16px;background:white;border-radius:1px;"></div>
    </div>
    <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid #D4691A;margin-top:-1px;"></div>
    <div style="width:3px;height:3px;border-radius:50%;background:#D4691A;opacity:0.7;"></div>
  </div>
`

export default function LocationPickerMap({
  onLocationSelect,
  selectedPosition,
  instructionText = 'Toca el mapa para marcar la ubicación del animal',
  helperText = 'También puedes arrastrar el pin para ajustar la posición exacta',
  readOnly = false,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerInstanceRef = useRef<any>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  useEffect(() => {
    if (!isClient || !mapRef.current) return

    // CSS de Leaflet desde CDN
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    link.crossOrigin = ''
    document.head.appendChild(link)

    // Estilos del contenedor del mapa
    const style = document.createElement('style')
    style.textContent = `
      .pawalert-picker-marker { background:none !important; border:none !important; }
      .pawalert-picker .leaflet-control-zoom {
        border:none !important;
        box-shadow:0 2px 10px rgba(0,0,0,0.1) !important;
        border-radius:10px !important;
        overflow:hidden;
      }
      .pawalert-picker .leaflet-control-zoom a {
        color:#5C4A3A !important;
        font-weight:700 !important;
      }
    `
    document.head.appendChild(style)

    import('leaflet').then(L => {
      const startCenter: [number, number] = selectedPosition
        ? [selectedPosition.latitud, selectedPosition.longitud]
        : DEFAULT_CENTER

      const map = L.map(mapRef.current!, { zoomControl: true })
        .setView(startCenter, 15)
      map.getContainer().classList.add('pawalert-picker')
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO'
      }).addTo(map)

      const pinIcon = L.divIcon({
        className: 'pawalert-picker-marker',
        html: PIN_HTML,
        iconSize: [38, 52],
        iconAnchor: [19, 52],
      })

      const marker = L.marker(startCenter, { draggable: !readOnly, icon: pinIcon }).addTo(map)
      markerInstanceRef.current = marker

      if (!readOnly) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng()
          onLocationSelect(pos.lat, pos.lng)
        })

        map.on('click', (e) => {
          marker.setLatLng(e.latlng)
          onLocationSelect(e.latlng.lat, e.latlng.lng)
        })
      }
    })

    return () => {
      document.head.removeChild(link)
      document.head.removeChild(style)
      mapInstanceRef.current?.remove()
    }
  }, [isClient, readOnly])

  useEffect(() => {
    if (!selectedPosition || !mapInstanceRef.current || !markerInstanceRef.current) return
    const { latitud, longitud } = selectedPosition
    mapInstanceRef.current.setView([latitud, longitud], 15)
    markerInstanceRef.current.setLatLng([latitud, longitud])
  }, [selectedPosition?.latitud, selectedPosition?.longitud])

  if (!isClient) {
    return (
      <div style={{
        width: '100%', height: '280px',
        backgroundColor: '#F0E8DC',
        borderRadius: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#9B8B7A', fontSize: '13px',
      }}>
        Cargando mapa...
      </div>
    )
  }

  return (
    <div>
      {/* Instrucción */}
      {!readOnly && <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        backgroundColor: '#FFF5EE', borderRadius: '10px',
        padding: '8px 12px', marginBottom: '8px',
      }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EC802B', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: '#D4691A', fontWeight: 600 }}>
          {instructionText}
        </span>
      </div>}

      {/* Mapa */}
      <div
        ref={mapRef}
        style={{
          width: '100%', height: readOnly ? '180px' : '280px',
          borderRadius: '14px',
          border: '1.5px solid #F0E8DC',
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        }}
      />

      {/* Instrucción inferior */}
      {!readOnly && <p style={{ fontSize: '11px', color: '#9B8B7A', textAlign: 'center', margin: '6px 0 0' }}>
        {helperText}
      </p>}
    </div>
  )
}
