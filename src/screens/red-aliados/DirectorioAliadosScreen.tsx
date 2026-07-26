import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { AssocAvatar } from '../../components/admin-dashboard/AssocAvatar';

const LeafletMap = Platform.OS === 'web' ? lazy(() => import('../LeafletMap')) : null;

const COLORS = {
  bgTeal: '#66BCB4',
  bgTealDark: '#4FA79F',
  bgTealLight: '#EDF8F7',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  grayLight: '#F3F4F6',
  border: '#F0E6D6',
  cardBg: '#FFFFFF',
  verde: '#27AE60',
  verdeDark: '#1E8449',
  azul: '#2E86DE',
};

const TIPO_LABEL: Record<string, string> = {
  donante_comunitario: 'Donante comunitario',
  aliado_local: 'Aliado local',
  patrocinador_institucional: 'Patrocinador institucional',
};

const TIPO_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  donante_comunitario: 'person-outline',
  aliado_local: 'storefront-outline',
  patrocinador_institucional: 'business-outline',
};

const CATEGORIA_LABEL: Record<string, string> = {
  alimentos: 'Alimentos',
  insumos: 'Insumos',
  servicios_veterinarios: 'Servicios veterinarios',
  difusion_campanas: 'Difusión y campañas',
};

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
} as const;

interface Aliado {
  id: string;
  nombre: string;
  tipo: string;
  categorias: string[];
  sello_verificado: boolean;
  latitud: number | null;
  longitud: number | null;
}

interface Historia {
  id: string;
  aliado_nombre: string;
  categoria: string | null;
  subcategoria: string | null;
  cantidad_valor: number | null;
  cantidad_unidad: string | null;
  asociacion_nombre: string | null;
  confirmada_at: string | null;
}

type Tab = 'directorio' | 'mapa' | 'mural';

interface Props {
  onClose?: () => void;
}

function EstadoVacio({ icon, title, desc }: { icon: keyof typeof Ionicons.glyphMap; title: string; desc?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.bgTealLight,
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      }}>
        <Ionicons name={icon} size={32} color={COLORS.bgTeal} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark, textAlign: 'center' }}>{title}</Text>
      {desc && (
        <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 6, textAlign: 'center', lineHeight: 19, maxWidth: 280 }}>
          {desc}
        </Text>
      )}
    </View>
  );
}

export default function DirectorioAliadosScreen({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('directorio');
  const [aliados, setAliados] = useState<Aliado[]>([]);
  const [historias, setHistorias] = useState<Historia[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [resAliados, resMural] = await Promise.all([
          axios.get(`${API_URL}/red-aliados/directorio`),
          axios.get(`${API_URL}/red-aliados/mural`),
        ]);
        setAliados(resAliados.data);
        setHistorias(resMural.data);
      } catch (err) {
        console.error('Error cargando Red de Aliados:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const aliadosConUbicacion = aliados.filter(
    (a): a is Aliado & { latitud: number; longitud: number } =>
      a.latitud !== null && a.longitud !== null
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgWhite }}>
      {/* Header */}
      <View style={{
        backgroundColor: COLORS.bgTeal, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28,
        borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="heart" size={22} color="#FFF" />
          </View>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFF', letterSpacing: -0.3 }}>Red de Aliados</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>
              Negocios y personas que ya están ayudando
            </Text>
          </View>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 18, padding: 7 }}>
            <Ionicons name="close" size={18} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: 20, marginTop: 4 }}>
        {([
          { key: 'directorio', label: 'Directorio', icon: 'list-outline' },
          { key: 'mapa', label: 'Mapa', icon: 'map-outline' },
          { key: 'mural', label: 'Huellas que ayudan', icon: 'heart-outline' },
        ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingVertical: 16, paddingHorizontal: 14,
              borderBottomWidth: 2.5, borderBottomColor: tab === key ? COLORS.primary : 'transparent',
            }}
          >
            <Ionicons name={icon} size={15} color={tab === key ? COLORS.primary : COLORS.textLight} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: tab === key ? COLORS.primary : COLORS.textLight }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <>
          {tab === 'directorio' && (
            aliados.length === 0 ? (
              <EstadoVacio
                icon="people-outline"
                title="Aún no hay aliados verificados"
                desc="En cuanto un administrador verifique el primer perfil, va a aparecer aquí."
              />
            ) : (
              <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
                {aliados.map(a => (
                  <View key={a.id} style={[{
                    backgroundColor: COLORS.cardBg, borderRadius: 18, padding: 16,
                    borderWidth: 1, borderColor: COLORS.border,
                    flexDirection: 'row', gap: 14,
                  }, CARD_SHADOW]}>
                    <AssocAvatar nombre={a.nombre} logoUrl={null} size="md" colors={[COLORS.verde, COLORS.bgTeal, COLORS.primary]} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark, flex: 1 }}>{a.nombre}</Text>
                        {a.sello_verificado && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 }}>
                            <Ionicons name="checkmark-circle" size={15} color={COLORS.azul} />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.azul }}>Verificado</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <Ionicons name={TIPO_ICON[a.tipo] || 'ribbon-outline'} size={12} color={COLORS.textLight} />
                        <Text style={{ fontSize: 12, color: COLORS.textLight }}>
                          {TIPO_LABEL[a.tipo] || a.tipo}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {a.categorias.map(cat => (
                          <View key={cat} style={{ backgroundColor: `${COLORS.verde}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.verdeDark }}>{CATEGORIA_LABEL[cat] || cat}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )
          )}

          {tab === 'mapa' && (
            <View style={{ flex: 1 }}>
              {Platform.OS === 'web' && LeafletMap ? (
                <Suspense fallback={<View style={{ flex: 1, backgroundColor: COLORS.grayLight }} />}>
                  <LeafletMap
                    reportes={[]}
                    aliados={aliadosConUbicacion}
                    onSelectReport={() => {}}
                    onMapClick={() => {}}
                  />
                </Suspense>
              ) : (
                <EstadoVacio icon="map-outline" title="Mapa disponible en la versión web" />
              )}
            </View>
          )}

          {tab === 'mural' && (
            historias.length === 0 ? (
              <EstadoVacio
                icon="heart-outline"
                title="Todavía no hay aportaciones confirmadas"
                desc="Aquí van a aparecer las historias de apoyo en cuanto se confirme la primera."
              />
            ) : (
              <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
                {historias.map(h => (
                  <View key={h.id} style={[{
                    backgroundColor: COLORS.bgTealLight, borderRadius: 18, padding: 16,
                    flexDirection: 'row', gap: 12,
                  }, CARD_SHADOW]}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bgTeal,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Ionicons name="heart" size={18} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textDark }}>
                        {h.aliado_nombre}
                      </Text>
                      <Text style={{ fontSize: 13, color: COLORS.textDark, marginTop: 4, lineHeight: 19 }}>
                        Aportó{h.cantidad_valor ? ` ${h.cantidad_valor} ${h.cantidad_unidad || ''}` : ''}
                        {h.categoria ? ` de ${CATEGORIA_LABEL[h.categoria] || h.categoria}` : ''}
                        {h.asociacion_nombre ? ` a ${h.asociacion_nombre}` : ''}.
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )
          )}
        </>
      )}
    </View>
  );
}
