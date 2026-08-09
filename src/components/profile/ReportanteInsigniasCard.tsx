import React from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
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

export function ReportanteInsigniasCard() {
  const { insignias, isLoading } = useMisInsignias(ROL);

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
              <View key={insignia.id} style={styles.badge}>
                <Image source={imagen} style={styles.badgeImagen} resizeMode="contain" />
                <Text style={styles.badgeNombre}>{info.nombre}</Text>
                <Text style={styles.badgeDescripcion}>{info.descripcion}</Text>
              </View>
            );
          })}
        </View>
      )}

      {pendientes.length > 0 && (
        <>
          <Text style={[styles.tituloSeccion, styles.tituloProximas]}>Próximas metas</Text>
          <View style={styles.grid}>
            {pendientes.map((codigo) => (
              <View key={codigo} style={[styles.badge, styles.badgeBloqueado]}>
                <Image
                  source={codigo === 'vigia_comunitario' ? IMAGENES_DINAMICAS.cobre : IMAGENES_FIJAS[codigo]}
                  style={[styles.badgeImagen, styles.badgeImagenGris]}
                  resizeMode="contain"
                />
                <Text style={[styles.badgeNombre, styles.textoBloqueado]}>{INFO[codigo].nombre}</Text>
                <Text style={[styles.badgeDescripcion, styles.textoBloqueado]}>{INFO[codigo].descripcion}</Text>
              </View>
            ))}
          </View>
        </>
      )}
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
    gap: 12,
  },
  badge: {
    width: 120,
    alignItems: 'center',
  },
  badgeImagen: {
    width: 64,
    height: 64,
    marginBottom: 6,
  },
  badgeNombre: {
    fontSize: 12,
    fontWeight: '800',
    color: Brand.textDark,
    textAlign: 'center',
  },
  badgeDescripcion: {
    fontSize: 10,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  badgeBloqueado: {
    opacity: 0.55,
  },
  badgeImagenGris: {
    opacity: 0.5,
  },
  textoBloqueado: {
    color: Brand.textFaint,
  },
});