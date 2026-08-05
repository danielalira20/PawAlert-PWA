import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const isWeb = Platform.OS === 'web';

const C = { primary: '#F5842B', primaryLight: '#F1D5B6', secondary: '#66C5BD', accent: '#F6CE5B', neutralLight: '#E8CCAD', text: '#2E2A26', bg: '#FFFFFF', bgSoft: '#FDF8F4', muted: '#9E8C7E', danger: '#E85D4B' };
const F = { displayBold: 'Fraunces_800ExtraBold', bodyRegular: 'Poppins_400Regular', bodyMedium: 'Poppins_500Medium', bodySemiBold: 'Poppins_600SemiBold' };

export interface RoleDetailData { id: string; title: string; icon: string; color: string; }
interface Props { role: RoleDetailData; onClose: () => void; }

const ROLE_DETAILS: Record<string, { tagline: string; description: string; steps: { icon: string; title: string; desc: string }[]; faq: { q: string; a: string }[]; }> = {
  reportante: {
    tagline: 'Tu foto puede salvar una vida.',
    description: 'Como Reportante eres el primer eslabon de la cadena de rescate. Desde tu celular, en segundos, puedes alertar a toda una red de voluntarios y asociaciones sobre un animal que necesita ayuda.',
    steps: [
      { icon: 'camera-outline', title: 'Toma la foto', desc: 'Captura 2-3 imagenes claras del animal, mostrando su estado y el entorno.' },
      { icon: 'location-outline', title: 'Marca la ubicacion', desc: 'La app usa tu GPS para marcar el punto exacto. Tambien puedes ajustarlo manualmente en el mapa.' },
      { icon: 'send-outline', title: 'Envia el reporte', desc: 'Con un toque el reporte llega a todas las asociaciones activas mas cercanas al animal.' },
      { icon: 'eye-outline', title: 'Segui el estado', desc: 'Desde la app podes ver en tiempo real como avanza el rescate: recibido, en camino, rescatado.' },
    ],
    faq: [
      { q: 'Necesito registrarme para reportar?', a: 'Si, necesitas una cuenta basica para que las asociaciones puedan contactarte si necesitan mas informacion.' },
      { q: 'Que hago si el animal es agresivo?', a: 'No intentes atraparlo. Reporta desde una distancia segura e indica en la descripcion que el animal puede ser reactivo.' },
      { q: 'Puedo reportar animales que no sean perros o gatos?', a: 'Si, PawAlert acepta reportes de cualquier animal domestico o silvestre que este en peligro.' },
    ],
  },
  'voluntario-asociacion': {
    tagline: 'Se parte del equipo que rescata.',
    description: 'Como Voluntario de Asociacion actuas dentro de un equipo organizado de rescatistas. Recibes las alertas de reportes, coordinas con tu asociacion y salis al terreno a atender los casos.',
    steps: [
      { icon: 'search-outline', title: 'Encontra tu asociacion', desc: 'Busca en el directorio de PawAlert una asociacion registrada en tu zona.' },
      { icon: 'person-add-outline', title: 'Solicita unirte', desc: 'Envia tu solicitud. La asociacion revisara tu perfil y te aceptara si hay lugar disponible.' },
      { icon: 'notifications-outline', title: 'Recibi alertas', desc: 'Una vez aceptado, recibes notificaciones en tiempo real de los reportes cercanos asignados a tu asociacion.' },
      { icon: 'paw-outline', title: 'Sali al terreno', desc: 'Coordina con tu equipo, atende el caso y actualiza el estado del animal en la app.' },
    ],
    faq: [
      { q: 'Necesito experiencia previa en rescate?', a: 'Depende de cada asociacion. Muchas aceptan voluntarios sin experiencia y los capacitan internamente.' },
      { q: 'Cuantas horas por semana implica?', a: 'Cada asociacion tiene sus propios criterios. Podes acordar disponibilidad parcial segun tu agenda.' },
      { q: 'Que pasa si no hay asociaciones en mi zona?', a: 'Podes registrar tu propia asociacion o unirte a una mas lejana para aprender y colaborar.' },
    ],
  },
  'voluntario-externo': {
    tagline: 'Tu hogar, su refugio temporal.',
    description: 'Como Voluntario Externo ofreces tu hogar como espacio de resguardo para animales rescatados que necesitan cuidado y seguimiento. Es una de las formas mas valiosas de ayudar.',
    steps: [
      { icon: 'document-text-outline', title: 'Completa el formulario', desc: 'Describe tu espacio, que tipo de animales podes alojar y cuanto tiempo maximo.' },
      { icon: 'checkmark-circle-outline', title: 'Validacion basica', desc: 'Un voluntario de PawAlert revisara tu postulacion sin necesidad de visita domiciliaria inicial.' },
      { icon: 'home-outline', title: 'Recibi animales', desc: 'Cuando una asociacion necesite casa temporal, podran contactarte directamente desde la plataforma.' },
      { icon: 'heart-outline', title: 'Acompana el proceso', desc: 'Cuidas al animal y lo llevas a controles veterinarios coordinados hasta una transferencia segura o su ingreso formal a una asociacion.' },
    ],
    faq: [
      { q: 'Puedo tener mascotas propias?', a: 'Si, pero debes indicarlo en el formulario para evaluar la compatibilidad con los animales que podrias recibir.' },
      { q: 'Quien cubre los gastos veterinarios?', a: 'Los gastos los cubre la asociacion responsable del animal. Vos solo aportas el espacio y los cuidados cotidianos.' },
      { q: 'Que pasa cuando termina mi tiempo de resguardo?', a: 'La asociacion coordinadora organiza una transferencia segura o un ingreso formal. El animal permanece contigo hasta confirmar la entrega.' },
    ],
  },
  asociacion: {
    tagline: 'Lidera los rescates en tu zona.',
    description: 'Las Asociaciones son el nucleo operativo de PawAlert. Reciben los reportes, coordinan equipos de voluntarios, gestionan los rescates y mantienen un historial de los animales atendidos.',
    steps: [
      { icon: 'business-outline', title: 'Registra tu organizacion', desc: 'Completa el formulario con datos de tu asociacion, equipo y zona de cobertura.' },
      { icon: 'shield-checkmark-outline', title: 'Proceso de validacion', desc: 'PawAlert verifica los datos basicos de la organizacion antes de activar el perfil en la plataforma.' },
      { icon: 'people-outline', title: 'Suma voluntarios', desc: 'Invita a tus voluntarios existentes o recibe solicitudes de nuevos a traves de la app.' },
      { icon: 'flash-outline', title: 'Gestiona rescates', desc: 'Recibe alertas de reportes cercanos, asigna casos a tu equipo y actualiza estados en tiempo real.' },
    ],
    faq: [
      { q: 'La plataforma tiene costo para asociaciones?', a: 'Durante la etapa de lanzamiento, PawAlert es gratuito para todas las asociaciones registradas.' },
      { q: 'Que documentacion necesito para registrarme?', a: 'Datos basicos de la organizacion: nombre, zona, tipo de animales. En fases futuras se requerira documentacion oficial.' },
      { q: 'Puedo gestionar multiples zonas?', a: 'Si, podes configurar multiples zonas de cobertura para recibir reportes de diferentes areas.' },
    ],
  },
  'donante-comunitario': {
    tagline: 'Tu aporte puntual hace la diferencia.',
    description: 'El Donante Comunitario es cualquier persona ya registrada en PawAlert que quiere hacer aportes puntuales de forma rapida y segura, como donaciones de alimento o insumos basicos.',
    steps: [
      { icon: 'heart-outline', title: 'Configura tu disponibilidad', desc: 'Indica si estas disponible para donar alimentos o insumos a los rescatistas de tu zona.' },
      { icon: 'shield-checkmark-outline', title: 'Privacidad a tu medida', desc: 'Puedes donar mostrando tu nombre, solo tu usuario o de forma completamente anonima.' },
      { icon: 'notifications-outline', title: 'Recibe solicitudes', desc: 'Las asociaciones cercanas podran ver tu oferta y contactarte cuando tengan una necesidad que coincida.' },
      { icon: 'checkmark-circle-outline', title: 'Acepta reglas de entrega', desc: 'Para seguridad de todos, confirma el lugar y la forma en que entregaras tu donacion.' },
    ],
    faq: [
      { q: 'Puedo ofrecer servicios veterinarios?', a: 'No, los donantes comunitarios solo pueden ofrecer alimentos e insumos. Si ofreces servicios profesionales, debes registrarte como Aliado Local.' },
      { q: 'Necesito un formulario nuevo?', a: 'No, tu perfil de donante comunitario se enlaza directamente a tu cuenta existente, no se requieren datos adicionales de registro.' },
      { q: 'Que pasa si no puedo donar todo el tiempo?', a: 'Puedes pausar tu disponibilidad o marcarla como limitada en cualquier momento desde tu panel de usuario.' },
    ],
  },
  'aliado-local': {
    tagline: 'Suma tu negocio o profesion al rescate.',
    description: 'El Aliado Local es un negocio, veterinaria o profesional independiente que participa de forma recurrente, ofreciendo servicios, descuentos o su espacio para campanas y acopio.',
    steps: [
      { icon: 'storefront-outline', title: 'Crea un perfil de Aliado', desc: 'Registra tu negocio o profesion. Indica tu ubicacion, horarios y formas de contacto.' },
      { icon: 'list-circle-outline', title: 'Define tu colaboracion', desc: 'Ofrece alimentos, insumos, servicios veterinarios o espacios para campanas de difusion.' },
      { icon: 'medical-outline', title: 'Servicios especializados', desc: 'Si eres veterinaria, podras definir el nivel de urgencia que atiendes, si requieres cita, y las especies.' },
      { icon: 'calendar-outline', title: 'Colaboracion recurrente', desc: 'Puedes dejar ofertas proactivas activas para que las asociaciones las tomen cuando las necesiten.' },
    ],
    faq: [
      { q: 'Soy veterinario, que necesito para registrarme?', a: 'Necesitaras proporcionar el nombre del medico responsable, numero de cedula profesional y un documento de verificacion valido.' },
      { q: 'Puedo limitar las atenciones que ofrezco?', a: 'Si, puedes definir un limite de atenciones por semana, mes o campana, y establecer tus propios horarios y restricciones.' },
      { q: 'Mi negocio sera visible publicamente?', a: 'Puedes decidir si quieres que el nombre de tu negocio o logo sea visible publicamente u operar bajo un alias.' },
    ],
  },
  'patrocinador-institucional': {
    tagline: 'Alianzas mayores para un impacto masivo.',
    description: 'Dirigido a empresas, fundaciones, ONGs, gobierno o instituciones educativas con la capacidad logistica de sostener el ecosistema de rescate a mayor escala.',
    steps: [
      { icon: 'business-outline', title: 'Registro Institucional', desc: 'Configura un perfil completo con la razon social, representante y tipo de institucion.' },
      { icon: 'document-text-outline', title: 'Validacion Oficial', desc: 'Se solicitaran documentos de identificacion institucional (como el RFC) para garantizar la formalidad y seguridad.' },
      { icon: 'cube-outline', title: 'Aportes por Lotes Fisicos', desc: 'Si aportas grandes cantidades (ej. toneladas de alimento), podras configurar lotes logisticos divisibles entre multiples asociaciones.' },
      { icon: 'bar-chart-outline', title: 'Mural de Impacto', desc: 'Las donaciones y aportes se reflejaran en un mural publico demostrando tu compromiso de responsabilidad social.' },
    ],
    faq: [
      { q: 'Emiten comprobantes fiscales para mi empresa?', a: 'Depende de la legislacion de tu pais y de la asociacion que recibe el apoyo. PawAlert directamente no emite comprobantes fiscales.' },
      { q: 'Se publica nuestra informacion fiscal u oficial?', a: 'No, datos como el RFC son estrictamente para validacion administrativa de PawAlert y nunca se exponen al publico.' },
      { q: 'Podemos ofrecer servicios pro bono (legales, tecnologicos)?', a: 'Si, las instituciones pueden seleccionar el apoyo mediante servicios profesionales en la categoria de "Difusion y campanas".' },
    ],
  },
};

// ── CONTENIDO REUTILIZABLE (Header + Body) ────────────────────────────────────
function ModalContent({ role, detail, onClose, compact }: { role: RoleDetailData; detail: any; onClose: () => void; compact?: boolean }) {
  const s = compact ? 0.85 : 1;
  return (
    <>
      {/* Header */}
      <View style={{ backgroundColor: `${role.color}12`, paddingTop: 16, paddingBottom: compact ? 18 : 24, paddingHorizontal: compact ? 20 : 24, borderBottomWidth: 1, borderBottomColor: `${role.color}20` }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: `${role.color}40`, alignSelf: 'center', marginBottom: 16 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: `${role.color}20`, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: `${role.color}35` }}>
            <Ionicons name={role.icon as any} size={26} color={role.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: C.text, letterSpacing: -0.5 }}>{role.title}</Text>
            <Text style={{ fontSize: 12, fontFamily: F.bodyMedium, color: role.color, marginTop: 2 }}>{detail.tagline}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${C.muted}15`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={18} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Body */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: compact ? 20 : 24, paddingBottom: 48, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 14, fontFamily: F.bodyMedium, color: C.text, lineHeight: 22, marginBottom: 28 }}>{detail.description}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: role.color }} />
          <Text style={{ fontSize: 10, fontFamily: F.bodySemiBold, color: role.color, textTransform: 'uppercase', letterSpacing: 2.5 }}>Como funciona?</Text>
        </View>
        <View style={{ gap: 10, marginBottom: 28 }}>
          {detail.steps.map((step: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: `${role.color}08`, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${role.color}15` }}>
              <View style={{ alignItems: 'center', gap: 3 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${role.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={step.icon as any} size={20} color={role.color} />
                </View>
                <Text style={{ fontSize: 9, fontFamily: F.bodySemiBold, color: `${role.color}70` }}>{String(i + 1).padStart(2, '0')}</Text>
              </View>
              <View style={{ flex: 1, paddingTop: 2 }}>
                <Text style={{ fontSize: 14, fontFamily: F.bodySemiBold, color: C.text, marginBottom: 3 }}>{step.title}</Text>
                <Text style={{ fontSize: 12, fontFamily: F.bodyRegular, color: C.muted, lineHeight: 18 }}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: role.color }} />
          <Text style={{ fontSize: 10, fontFamily: F.bodySemiBold, color: role.color, textTransform: 'uppercase', letterSpacing: 2.5 }}>Preguntas frecuentes</Text>
        </View>
        <View style={{ gap: 10, marginBottom: 28 }}>
          {detail.faq.map((item: any, i: number) => (
            <View key={i} style={{ backgroundColor: C.bgSoft, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: `${C.neutralLight}80` }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                <Ionicons name="help-circle-outline" size={16} color={role.color} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 13, fontFamily: F.bodySemiBold, color: C.text, flex: 1, lineHeight: 18 }}>{item.q}</Text>
              </View>
              <Text style={{ fontSize: 12, fontFamily: F.bodyRegular, color: C.muted, lineHeight: 18, paddingLeft: 24 }}>{item.a}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function RoleDetailModal({ role, onClose }: Props) {
  const screenHeight = Dimensions.get('window').height;
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 11, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: screenHeight, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const detail = ROLE_DETAILS[role.id];
  if (!detail) return null;

  const sheetStyle = isWeb
    ? { boxShadow: isDesktop ? '0 8px 56px rgba(46,42,38,0.22)' : '0 -8px 48px rgba(46,42,38,0.18)' }
    : { elevation: 24 };

  return (
    <View style={{ flex: 1 }}>
      {/* Overlay */}
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(46,42,38,0.55)', opacity: overlayOpacity }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {isDesktop ? (
        /* DESKTOP: dialogo centrado con margen en todos los lados */
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', pointerEvents: 'box-none' } as any}>
          <Animated.View style={[{
            width: Math.min(width - 96, 700),
            maxHeight: screenHeight - 96,
            backgroundColor: C.bg,
            borderRadius: 28,
            overflow: 'hidden',
            transform: [{ translateY: slideAnim }],
          }, sheetStyle] as any}>
            <ModalContent role={role} detail={detail} onClose={handleClose} />
          </Animated.View>
        </View>
      ) : (
        /* MOBILE: bottom sheet con margen en todos los lados */
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16 }}>
          <Animated.View style={[{
            width: '100%',
            maxHeight: screenHeight * 0.85,
            backgroundColor: C.bg,
            borderRadius: 24,
            overflow: 'hidden',
            transform: [{ translateY: slideAnim }],
          }, sheetStyle] as any}>
            <ModalContent role={role} detail={detail} onClose={handleClose} compact />
          </Animated.View>
        </View>
      )}
    </View>
  );
}
