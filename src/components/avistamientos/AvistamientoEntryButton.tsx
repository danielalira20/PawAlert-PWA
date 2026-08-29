import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';

const C = {
  teal: '#66BCB4',
  tealSoft: '#E8F7F5',
  text: '#4A3728',
  muted: '#8C7A6B',
  white: '#FFFFFF',
};

/** Datos mínimos del reporte que necesita el pre-filtro de visibilidad. */
export interface ReporteParaAvistamiento {
  id: string;
  /** Dueño del reporte. Puede venir ausente en listados que ya están
   * acotados al usuario (p. ej. GET /reports/me): ahí el host lo pasa
   * explícitamente porque la propiedad es un hecho del endpoint. */
  usuario_id?: string | null;
  staff_asignado_id?: string | null;
  asociacion_asignada_id?: string | null;
}

export interface UsuarioParaAvistamiento {
  id: string;
  rol?: string | null;
  asociacion_id?: string | null;
}

/** Roles que pueden registrar un avistamiento como "testigo cercano" de un
 * caso que no es el suyo (backend: LocationSource.testigo_cercano),
 * siempre que además cumplan el trust_score mínimo -- eso solo lo valida
 * el backend, aquí no se duplica. Aliado_local, staff y asociación quedan
 * fuera a propósito. */
const ROLES_TESTIGO_CERCANO = [
  'voluntario_interno',
  'donante_comunitario',
  'patrocinador_institucional',
];

/**
 * Pre-filtro barato en cliente para decidir si se ofrece el punto de entrada.
 *
 * Deliberadamente NO calcula distancias ni trust_score: la verdad sobre el
 * radio de entrada y la elegibilidad real la da
 * `GET /reports/{id}/avistamientos/elegible` una vez dentro de la pantalla.
 * Aquí solo se descartan los casos que ni siquiera tiene sentido ofrecer,
 * para no mandar a nadie a una pantalla que le va a responder 403 o 422.
 *
 * El voluntario asignado queda fuera a propósito: su camino para reportar
 * dónde está el animal son los hitos de rescate, no esta pantalla.
 */
export function puedeRegistrarAvistamiento(
  reporte: ReporteParaAvistamiento | null | undefined,
  usuario: UsuarioParaAvistamiento | null | undefined,
): boolean {
  if (!reporte || !usuario?.id) return false;

  if (reporte.staff_asignado_id && reporte.staff_asignado_id === usuario.id) {
    return false;
  }
  if (reporte.usuario_id && reporte.usuario_id === usuario.id) return true;
  if (
    (usuario.rol === 'asociacion' || usuario.rol === 'staff')
    && !!usuario.asociacion_id
    && usuario.asociacion_id === reporte.asociacion_asignada_id
  ) {
    return true;
  }
  if (usuario.rol === 'voluntario_externo') return true;
  // Testigo cercano (Entrega C): el reportante SÍ entra aquí, pero solo
  // para un caso que no es el suyo -- si lo fuera, ya habría salido true
  // arriba. El resto de roles habilitados no tiene ese matiz.
  if (usuario.rol === 'reportante') return true;
  if (usuario.rol && ROLES_TESTIGO_CERCANO.includes(usuario.rol)) return true;

  return false;
}

export function AvistamientoEntryButton({
  reporte,
  compacto = false,
  onBeforeNavigate,
}: {
  reporte: ReporteParaAvistamiento;
  compacto?: boolean;
  /** Se llama justo antes de navegar. Los hosts que viven dentro de un modal
   * (MisReportes, panel de asociación) lo usan para cerrarlo primero y no
   * dejar la pantalla nueva apilada encima — mismo patrón que
   * `if (onClose) onClose(); router.push(...)` de "crear necesidad". */
  onBeforeNavigate?: () => void;
}) {
  const { user } = useAuth();

  if (!puedeRegistrarAvistamiento(reporte, user)) return null;

  const abrir = () => {
    onBeforeNavigate?.();
    // Solo el id en la URL: la pantalla resuelve el resto (animales incluidos)
    // vía GET .../avistamientos/elegible, que ya consulta como paso previo.
    router.push({
      pathname: '/registrar-avistamiento',
      params: { reporteId: reporte.id },
    } as never);
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Registrar avistamiento"
      onPress={abrir}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: compacto ? 10 : 16,
        paddingVertical: compacto ? 10 : 13,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: C.teal,
        backgroundColor: C.tealSoft,
      }}
    >
      <Ionicons name="eye-outline" size={19} color={C.teal} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '900' }}>
          Reportar avistamiento
        </Text>
        {!compacto && (
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }}>
            ¿Viste al animal en otro lugar? Compártenos dónde para ayudar a
            quien lo está buscando.
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.muted} />
    </TouchableOpacity>
  );
}
