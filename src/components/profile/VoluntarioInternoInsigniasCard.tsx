import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Brand } from '../../constants/theme';
import { useMisInsignias, InsigniaReputacion } from '../../hooks/useMisInsignias';

const ROL = 'voluntario_interno';

// Diccionario de insignias para el voluntario (según el contrato de Persona 2)
const IMAGENES_DINAMICAS: Record<string, any> = {
  cobre: require('../../../assets/insignias/voluntarios/rescatista_pawalert_cobre.png'),
  plata: require('../../../assets/insignias/voluntarios/rescatista_pawalert_plata.png'),
  oro: require('../../../assets/insignias/voluntarios/rescatista_pawalert_oro.png'),
};

const IMAGENES_FIJAS: Record<string, any> = {
  compromiso_cumplido: require('../../../assets/insignias/voluntarios/compromiso_cumplido.png'),
  verificador_de_confianza: require('../../../assets/insignias/voluntarios/verificador_de_confianza.png'),
};

const INFO: Record<string, { nombre: string; descripcion: string }> = {
  rescatista_pawalert: {
    nombre: 'Rescatista PawAlert',
    descripcion: 'Cobre: 1 rescate · Plata: 5 rescates · Oro: 15 rescates',
  },
  compromiso_cumplido: {
    nombre: 'Compromiso Cumplido',
    descripcion: 'Cumpliste con tu agenda operativa sin faltas este mes',
  },
  verificador_de_confianza: {
    nombre: 'Verificador de Confianza',
    descripcion: 'Tus evaluaciones en campo son 100% precisas',
  },
};

const CODIGOS_PENDIENTES_DE_BACKEND = new Set(['verificador_de_confianza']);

function imagenPara(insignia: InsigniaReputacion): any {
  if (insignia.codigo_insignia === 'rescatista_pawalert' && insignia.nivel) {
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

function formatProgreso(insignia: InsigniaReputacion): string {
  if (insignia.codigo_insignia === 'rescatista_pawalert') {
    return `${insignia.progreso} traslado${insignia.progreso === 1 ? '' : 's'} exitoso${insignia.progreso === 1 ? '' : 's'}`;
  }
  return `Progreso: ${insignia.progreso}`;
}

interface DetalleModal {
  nombre: string;
  descripcion: string;
  imagen: any;
  obtenida: boolean;
  insignia?: InsigniaReputacion;
}

export function VoluntarioInternoInsigniasCard() {
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
        <Text style={styles.vacio}>Todavía no tienes insignias. Ayuda en tu primer rescate para comenzar a ganar.</Text>
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
              const imagen = codigo === 'rescatista_pawalert' ? IMAGENES_DINAMICAS.cobre : IMAGENES_FIJAS[codigo];
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
