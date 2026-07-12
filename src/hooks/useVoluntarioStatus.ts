import { useState, useEffect } from 'react';

// Ajusta esta interfaz según los datos reales que te devuelva tu backend
export interface VoluntarioStatusResponse {
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'revision';
  fechaPostulacion?: string;
  comentarios?: string;
}

export function useVoluntarioStatus() {
  const [data, setData] = useState<VoluntarioStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // TODO: Reemplaza este bloque con tu llamada real a la API
        // const response = await api.get('/voluntarios/mi-estatus');
        // if (isMounted) setData(response.data);

        // --- Mock temporal para evitar que la app crashee ---
        setTimeout(() => {
          if (isMounted) {
            setData({
              estado: 'pendiente',
              fechaPostulacion: new Date().toISOString(),
              comentarios: 'Tu solicitud está siendo revisada por el equipo.',
            });
            setIsLoading(false);
          }
        }, 1500);
        // ----------------------------------------------------

      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Error al obtener el estado de postulación');
          setIsLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  // Función para recargar los datos manualmente si tu pantalla lo necesita
  const refetch = () => {
    setIsLoading(true);
    // Vuelve a ejecutar la lógica de fetchStatus aquí
  };

  return {
    data,
    isLoading,
    error,
    refetch
  };
}