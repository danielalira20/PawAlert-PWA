export type EventType =
  | 'vacunacion'
  | 'esterilizacion'
  | 'feria_adopcion'
  | 'identificacion'
  | 'acopio'
  | 'capacitacion'
  | 'bienestar_animal'
  | 'otro';

export type EventAccessMode =
  | 'sin_registro'
  | 'registro_externo'
  | 'contacto_institucional';

export type EventCapacityState = 'no_aplica' | 'disponible' | 'agotado';

export type EventProfessionalDataState =
  | 'no_aplica'
  | 'declarado'
  | 'verificado';

export type EventState =
  | 'borrador'
  | 'publicado'
  | 'pausado'
  | 'cancelado'
  | 'finalizado'
  | 'archivado'
  | 'suspendido_admin';

export type EventReportReason =
  | 'informacion_falsa'
  | 'servicio_riesgoso'
  | 'ubicacion_incorrecta'
  | 'cobro_no_informado'
  | 'otro';

export type EventReportState =
  | 'pendiente'
  | 'en_revision'
  | 'requiere_informacion'
  | 'resuelto'
  | 'descartado';

export interface EventAssociationPublic {
  id: string;
  nombre: string;
  logo_url: string | null;
  acerca_de: string | null;
}

export interface EventWriteData {
  responsable_operativo_usuario_id?: string | null;
  tipo?: EventType | null;
  categoria_otro?: string | null;
  titulo?: string | null;
  descripcion?: string | null;
  inicia_at?: string | null;
  termina_at?: string | null;
  zona_horaria?: string | null;
  lugar_nombre?: string | null;
  direccion_publica?: string | null;
  municipio?: string | null;
  estado_ubicacion?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  modalidad_acceso?: EventAccessMode | null;
  enlace_registro_externo?: string | null;
  instrucciones_contacto?: string | null;
  especies_objetivo?: string[];
  publico_objetivo?: string | null;
  requisitos_asistencia?: string | null;
  servicios_detalle?: string | null;
  condiciones_excluidas?: string[];
  documentos_requeridos?: string[];
  contacto_institucional_nombre?: string | null;
  contacto_institucional_telefono?: string | null;
  contacto_institucional_email?: string | null;
  es_gratuito?: boolean | null;
  costo_centavos?: number | null;
  moneda?: string | null;
  detalle_costos?: string | null;
  cupo_total?: number | null;
  cupo_estado?: EventCapacityState | null;
  responsable_profesional?: string | null;
  cedula_profesional?: string | null;
  institucion_profesional?: string | null;
  datos_profesionales_estado?: EventProfessionalDataState | null;
  accesibilidad?: string | null;
  transporte?: string | null;
}

export interface EventDraftCreate {
  datos: EventWriteData;
  idempotency_key: string;
}

export interface EventUpdate {
  datos: EventWriteData;
  idempotency_key: string;
}

export interface EventAction {
  idempotency_key: string;
}

export interface EventPause extends EventAction {
  motivo: string;
}

export interface EventCancel extends EventAction {
  motivo_publico: string;
}

export interface EventReportCreate extends EventAction {
  motivo: EventReportReason;
  descripcion: string;
}

export interface EventAdminSuspend extends EventAction {
  motivo: string;
}

export interface EventAdminRestore extends EventAction {
  resolucion: string;
}

export interface EventOperationResponse {
  id: string;
  estado: EventState;
  version_publica: number;
  updated_at: string;
  event_id: string;
  reintento: boolean;
  notificaciones_encoladas?: number;
}

export interface EventImageOperationResponse extends EventOperationResponse {
  imagen_url: string | null;
  imagen_url_expira_at: string | null;
  imagen_mime_type: string | null;
  imagen_size_bytes: number | null;
  imagen_texto_alternativo: string | null;
  storage_cleanup_pending: boolean;
}

export interface EventSavedOperationResponse {
  id: string | null;
  evento_id: string;
  guardado: boolean;
  event_id: string | null;
  reintento: boolean;
}

export interface EventPublicSummary {
  id: string;
  tipo: EventType;
  categoria_otro: string | null;
  titulo: string;
  descripcion: string;
  inicia_at: string;
  termina_at: string;
  zona_horaria: string;
  municipio: string;
  estado_ubicacion: string;
  especies_objetivo: string[];
  es_gratuito: boolean;
  costo_centavos: number | null;
  moneda: string;
  cupo_total: number | null;
  cupo_estado: EventCapacityState;
  imagen_url: string | null;
  imagen_url_expira_at: string | null;
  imagen_texto_alternativo: string | null;
  asociacion: EventAssociationPublic;
}

export interface EventPublicDetail extends EventPublicSummary {
  lugar_nombre: string;
  direccion_publica: string;
  latitud: number;
  longitud: number;
  modalidad_acceso: EventAccessMode;
  enlace_registro_externo: string | null;
  instrucciones_contacto: string | null;
  publico_objetivo: string;
  requisitos_asistencia: string;
  servicios_detalle: string | null;
  condiciones_excluidas: string[];
  documentos_requeridos: string[];
  contacto_institucional_nombre: string;
  contacto_institucional_telefono: string | null;
  contacto_institucional_email: string | null;
  detalle_costos: string | null;
  responsable_profesional: string | null;
  cedula_profesional: string | null;
  institucion_profesional: string | null;
  datos_profesionales_estado: EventProfessionalDataState;
  accesibilidad: string | null;
  transporte: string | null;
  estado: 'publicado' | 'cancelado';
  version_publica: number;
  publicado_at: string;
  motivo_cancelacion_publico: string | null;
}

export interface EventPublicPage {
  items: EventPublicSummary[];
  pagina: number;
  limite: number;
  total: number;
  tiene_mas: boolean;
}

export interface EventMapItem {
  id: string;
  tipo: EventType;
  titulo: string;
  inicia_at: string;
  termina_at: string;
  zona_horaria: string;
  latitud: number;
  longitud: number;
  cupo_estado: EventCapacityState;
  asociacion: EventAssociationPublic;
}

export interface EventAssociationView {
  id: string;
  asociacion_id: string;
  responsable_operativo_usuario_id: string | null;
  tipo: EventType | null;
  categoria_otro: string | null;
  titulo: string | null;
  descripcion: string | null;
  inicia_at: string | null;
  termina_at: string | null;
  zona_horaria: string | null;
  lugar_nombre: string | null;
  direccion_publica: string | null;
  municipio: string | null;
  estado_ubicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  modalidad_acceso: EventAccessMode | null;
  enlace_registro_externo: string | null;
  instrucciones_contacto: string | null;
  especies_objetivo: string[];
  publico_objetivo: string | null;
  requisitos_asistencia: string | null;
  servicios_detalle: string | null;
  condiciones_excluidas: string[];
  documentos_requeridos: string[];
  contacto_institucional_nombre: string | null;
  contacto_institucional_telefono: string | null;
  contacto_institucional_email: string | null;
  es_gratuito: boolean | null;
  costo_centavos: number | null;
  moneda: string;
  detalle_costos: string | null;
  cupo_total: number | null;
  cupo_estado: EventCapacityState;
  responsable_profesional: string | null;
  cedula_profesional: string | null;
  institucion_profesional: string | null;
  datos_profesionales_estado: EventProfessionalDataState;
  imagen_url: string | null;
  imagen_url_expira_at: string | null;
  imagen_texto_alternativo: string | null;
  accesibilidad: string | null;
  transporte: string | null;
  estado: EventState;
  version_publica: number;
  publicado_at: string | null;
  pausado_at: string | null;
  cancelado_at: string | null;
  motivo_cancelacion_publico: string | null;
  finalizado_at: string | null;
  archivado_at: string | null;
  suspendido_at: string | null;
  motivo_suspension: string | null;
  creado_at: string;
  actualizada_at: string;
}

export interface EventSavedView {
  id: string;
  evento_id: string;
  creado_at: string;
  evento: EventPublicSummary;
}

export interface EventReportResponse {
  id: string;
  evento_id: string;
  motivo: EventReportReason;
  estado: EventReportState;
  creado_at: string;
  reintento: boolean;
}

export interface EventAdminIncidentAssociation {
  id: string;
  nombre: string;
}

export interface EventAdminIncidentEvent {
  id: string;
  asociacion_id: string;
  titulo: string;
  tipo: EventType;
  estado: EventState;
  version_publica: number;
  asociacion: EventAdminIncidentAssociation;
}

export interface EventAdminIncident {
  id: string;
  evento_id: string;
  reportado_por_usuario_id: string;
  motivo: EventReportReason;
  descripcion: string;
  estado: EventReportState;
  revisado_por_usuario_id: string | null;
  revisado_at: string | null;
  resolucion: string | null;
  resuelto_at: string | null;
  creado_at: string;
  actualizada_at: string;
  evento: EventAdminIncidentEvent;
}

export interface EventAdminIncidentPage {
  items: EventAdminIncident[];
  pagina: number;
  limite: number;
  total: number;
  tiene_mas: boolean;
}

export interface EventPublicFilters {
  tipo?: EventType;
  asociacion_id?: string;
  municipio?: string;
  especie?: string;
  gratuito?: boolean;
  desde?: string;
  hasta?: string;
  pagina?: number;
  limite?: number;
}

export interface EventMapFilters {
  tipo?: EventType;
  municipio?: string;
  especie?: string;
  gratuito?: boolean;
  desde?: string;
  hasta?: string;
  latitud_min?: number;
  latitud_max?: number;
  longitud_min?: number;
  longitud_max?: number;
  limite?: number;
}

export interface EventAssociationFilters {
  estado?: EventState;
  limite?: number;
}

export interface EventAdminIncidentFilters {
  estado?: EventReportState;
  motivo?: EventReportReason;
  evento_id?: string;
  pagina?: number;
  limite?: number;
}
