import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Brand } from '../../constants/theme';
import { useMisInsignias, InsigniaReputacion } from '../../hooks/useMisInsignias';

const ROL = 'reportante';

// Fuente de verdad visual, en espejo de evaluar_insignias_reportante
// (reputacion_service.py). Si el backend agrega/quita una insignia,
// este diccionario hay que actualizarlo a mano -- mismo patrón que
// INSIGNIA_INFO en AliadoInsigniasCard.tsx (Miguel).
const IMAGENES_DINAMICAS: Record<string, any> = {
  cobre: require('../../../assets/insignias/reportantes/vigia_comunitario_cobre.png'),
  plata: require('../../../assets/insignias/reportantes/vigia_comunitario_plata.png'),
  oro: require('../../../assets/insignias/reportantes/vigia_comunitario_oro.png'),
};

const IMAGENES_FIJAS: Record<string, any> = {
  impacto_real: require('../../../assets/insignias/reportantes/impacto_real.png'),
  evidencia_confiable: require('../../../assets/insignias/reportantes/evidencia_confiable.png'),
};

const INFO: Record<string, { nombre: string; descripcion: string }> = {
  vigia_comunitario: {
    nombre: 'Vigía comunitario',
    descripcion: 'Cobre: 1 reporte válido · Plata: 5 · Oro: 15',
  },
  impacto_real: {
    nombre: 'Impacto real',
    descripcion: '3 reportes propios llegan a un desenlace confirmado',
  },
  evidencia_confiable: {
    nombre: 'Evidencia confiable',
    descripcion: '5 reportes con evidencia aceptada, próximamente',
  },
};

// Todavía no implementada en el backend (evaluar_insignias_reportante) —
// se muestra bloqueada siempre, nunca aparece en "obtenidas".
const CODIGOS_PENDIENTES_DE_BACKEND = new Set(['evidencia_confiable']);

function imagenPara(insignia: InsigniaReputacion): any {
  if (insignia.codigo_insignia === 'vigia_comunitario' && insignia.nivel) {
    return IMAGENES_DINAMICAS[insignia.nivel];
  }
  return IMAGENES_FIJAS[insignia.codigo_insignia];
}

function formatFechaCorta(iso: string): string {
  const fecha = new Date(iso);
  const mes = fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${mesCapitalizado} ${fecha.getFullYear()}`;
}

const NIVEL_LABEL: Record<string, string> = { cobre: 'Cobre', plata: 'Plata', oro: 'Oro' };

// Texto de progreso REAL, a partir del campo progreso que ya manda el
// backend -- nada inventado. Distinto por codigo porque "progreso"
// significa cosas distintas segun la insignia (reportes válidos vs.
// desenlaces confirmados).
function formatProgreso(insignia: InsigniaReputacion): string {
  if (insignia.codigo_insignia === 'vigia_comunitario') {
    return `${insignia.progreso} reporte${insignia.progreso === 1 ? '' : 's'} válido${insignia.progreso === 1 ? '' : 's'} en total`;
  }
  if (insignia.codigo_insignia === 'impacto_real') {
    return `${insignia.progreso} reporte${insignia.progreso === 1 ? '' : 's'} con desenlace confirmado`;
  }
  return `Progreso: ${insignia.progreso}`;
}

interface DetalleModal {
  nombre: string;
  descripcion: string;
  imagen: any;
  obtenida: boolean;
  insignia?: InsigniaReputacion; // solo si obtenida=true, para mostrar nivel/progreso/fechas reales
}

export function ReportanteInsigniasCard() {
  const { insignias, isLoading } = useMisInsignias(ROL);
  const [detalle, setDetalle] = useState<DetalleModal | null>(null);

  const codigosObtenidos = new Set(insignias.map((i) => i.codigo_insignia));
  const pendientes = Object.keys(INFO).filter(
    (codigo) => !codigosObtenidos.has(codigo) || CODIGOS_PENDIENTES_DE_BACKEND.has(codigo)
  );

  return (
    <View style={styles.card}>
      <Text style={styles.tituloSeccion}>Obtenidas · {insignias.length} insignias</Text>

      {isLoading ? (
        <ActivityIndicator color={Brand.primary} style={{ marginVertical: 20 }} />
      ) : insignias.length === 0 ? (
        <Text style={styles.vacio}>Todavía no tienes insignias — sigue reportando para desbloquear la primera.</Text>
      ) : (
        <View style={styles.grid}>
          {insignias.map((insignia) => {
            const info = INFO[insignia.codigo_insignia];
            const imagen = imagenPara(insignia);
            if (!info || !imagen) return null;
            return (
              <TouchableOpacity
                key={insignia.id}
                style={styles.badge}
                activeOpacity={0.7}
                onPress={() =>
                  setDetalle({
                    nombre: info.nombre,
                    descripcion: info.descripcion,
                    imagen,
                    obtenida: true,
                    insignia,
                  })
                }
              >
                <Image source={imagen} style={styles.badgeImagen} resizeMode="contain" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {pendientes.length > 0 && (
        <>
          <Text style={[styles.tituloSeccion, styles.tituloProximas]}>Próximas metas</Text>
          <View style={styles.grid}>
            {pendientes.map((codigo) => {
              const imagen = codigo === 'vigia_comunitario' ? IMAGENES_DINAMICAS.cobre : IMAGENES_FIJAS[codigo];
              return (
                <TouchableOpacity
                  key={codigo}
                  style={styles.badge}
                  activeOpacity={0.7}
                  onPress={() =>
                    setDetalle({
                      nombre: INFO[codigo].nombre,
                      descripcion: INFO[codigo].descripcion,
                      imagen,
                      obtenida: false,
                    })
                  }
                >
                  <Image
                    source={imagen}
                    style={[styles.badgeImagen, styles.badgeImagenBloqueada]}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <Modal visible={detalle !== null} transparent animationType="fade" onRequestClose={() => setDetalle(null)}>
        <Pressable style={styles.overlay} onPress={() => setDetalle(null)}>
          <Pressable style={styles.modalTarjeta} onPress={() => {}}>
            <Image
              source={detalle?.imagen}
              style={[styles.modalImagen, !detalle?.obtenida && styles.badgeImagenBloqueada]}
              resizeMode="contain"
            />
            <Text style={styles.modalNombre}>{detalle?.nombre}</Text>
            <Text style={styles.modalDescripcion}>{detalle?.descripcion}</Text>

            {detalle?.obtenida && detalle.insignia ? (
              <>
                {detalle.insignia.nivel && (
                  <Text style={styles.modalNivel}>Nivel: {NIVEL_LABEL[detalle.insignia.nivel] ?? detalle.insignia.nivel}</Text>
                )}
                <Text style={styles.modalProgreso}>{formatProgreso(detalle.insignia)}</Text>
                {detalle.insignia.obtenido_at && (
                  <Text style={styles.modalObtenida}>✓ Obtenida en {formatFechaCorta(detalle.insignia.obtenido_at)}</Text>
                )}
                {detalle.insignia.mejorado_at && detalle.insignia.mejorado_at !== detalle.insignia.obtenido_at && (
                  <Text style={styles.modalMejora}>Última mejora: {formatFechaCorta(detalle.insignia.mejorado_at)}</Text>
                )}
              </>
            ) : (
              <Text style={styles.modalPendiente}>Aún no obtenida</Text>
            )}

            <TouchableOpacity style={styles.modalCerrar} onPress={() => setDetalle(null)}>
              <Text style={styles.modalCerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 16,
    padding: 16,
  },
  tituloSeccion: {
    fontSize: 12,
    fontWeight: '800',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  tituloProximas: {
    marginTop: 20,
  },
  vacio: {
    fontSize: 13,
    color: Brand.textMuted,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  badge: {
    width: 128,
  },
  badgeImagen: {
    width: 180,
    height: 180,
  },

  badgeImagenBloqueada: {
    opacity: 0.45,
  },

  // Modal de detalle
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 42, 38, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalTarjeta: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  modalImagen: {
    width: 120,
    height: 120,
    marginBottom: 16,
  },
  modalNombre: {
    fontSize: 18,
    fontWeight: '900',
    color: Brand.primary,
    textAlign: 'center',
  },
  modalDescripcion: {
    fontSize: 13,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  modalNivel: {
    fontSize: 13,
    fontWeight: '800',
    color: Brand.textDark,
    marginTop: 12,
  },
  modalProgreso: {
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
  },
  modalObtenida: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.secondary,
    marginTop: 10,
  },
  modalMejora: {
    fontSize: 12,
    color: Brand.textFaint,
    marginTop: 2,
  },
  modalPendiente: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textFaint,
    marginTop: 10,
  },
  modalCerrar: {
    marginTop: 20,
    backgroundColor: Brand.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  modalCerrarTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});