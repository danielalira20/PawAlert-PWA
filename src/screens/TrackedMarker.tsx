import React, { useEffect, useState } from 'react';
import { Marker, MarkerProps } from 'react-native-maps';

/**
 * Envuelve <Marker> para resolver un bug conocido de Android: si el marcador
 * usa una imagen REMOTA (como nuestros íconos de perro/gato vía URI) y se le
 * pone tracksViewChanges={false} desde el primer render, Android le toma la
 * "foto" (snapshot) al marcador ANTES de que la imagen termine de cargar —
 * y como tracksViewChanges:false le dice que ya no vuelva a redibujar, el
 * pin se queda congelado invisible/en blanco para siempre.
 *
 * Empezamos con tracksViewChanges=true (Android sí redibuja mientras tanto)
 * y lo cambiamos a false después de un momento, ya con la imagen cargada.
 * Cada instancia de este componente maneja su propio temporizador, así que
 * los marcadores que aparezcan después (ej. nuevos reportes que llegan por
 * polling) también obtienen su propia ventana de tiempo, no solo los que
 * ya estaban al montar la pantalla.
 */
export function TrackedMarker(props: MarkerProps & { children?: React.ReactNode }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setTracksViewChanges(false), 600);
    return () => clearTimeout(timeout);
  }, []);

  return <Marker {...props} tracksViewChanges={tracksViewChanges} />;
}