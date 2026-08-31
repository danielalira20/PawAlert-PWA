import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { Toast, useToast } from "../../components/Toast";
import { AppModal } from "../../components/AppModal";
import { EventDateTimeModal } from "../../components/events/editor/EventDateTimeModal";
import { EventLifecycleActions } from "../../components/events/editor/EventLifecycleActions";
import {
  EventChoiceField,
  EventFormSection,
  EventOptionChips,
  EventTextField,
} from "../../components/events/editor/EventFormControls";
import { EventLocationPicker } from "../../components/events/editor/EventLocationPicker";
import { EventProgressHeader } from "../../components/events/editor/EventProgressHeader";
import { EventValidationSummary } from "../../components/events/editor/EventValidationSummary";
import { EventStatusChip } from "../../components/events/shared/EventStatusChip";
import {
  ACCESS_MODE_OPTIONS,
  AUDIENCE_OPTIONS,
  COST_MODE_OPTIONS,
  DOCUMENT_OPTIONS,
  EVENT_FORM_STEPS,
  EVENT_SERVICE_OPTIONS,
  EVENT_TITLE_SUGGESTIONS,
  EVENT_TYPE_OPTIONS,
  EXCLUSION_OPTIONS,
  REQUIREMENT_OPTIONS,
  SPECIES_OPTIONS,
  TIME_ZONE_OPTIONS,
} from "../../constants/eventForm";
import { API_URL } from "../../constants/api";
import { EventTheme } from "../../constants/eventTheme";
import { useAuth } from "../../context/AuthContext";
import {
  createAssociationEvent,
  createEventIdempotencyKey,
  listAssociationEvents,
  normalizeEventApiError,
  removeAssociationEventImage,
  replaceAssociationEventImage,
  updateAssociationEvent,
} from "../../services/eventService";
import type {
  EventAssociationView,
  EventOperationResponse,
  EventState,
  EventType,
} from "../../types/event";
import {
  acquireEventActionLock,
  getIncompleteEventSteps,
  type EventLifecycleAction,
} from "../../utils/eventLifecycle";
import {
  createInitialEventValues,
  eventValuesFromAssociation,
  eventValuesToWriteData,
  generateEventDescription,
  getEventStepCompletion,
  getEventStepIssues,
  toggleEventOption,
  type EventEditorValues,
} from "../../utils/eventForm";

interface StaffMember {
  id: string;
  nombre: string;
  apellido_paterno?: string | null;
  email?: string | null;
  telefono?: string | null;
}

interface Props {
  eventId?: string;
  onClose: () => void;
  onEventCreated?: (eventId: string) => void;
  presentation?: "screen" | "modal";
}

interface RemoteImageState {
  url: string;
  expiresAt: string | null;
  alternativeText: string | null;
}

type DateTarget = "inicio" | "fin" | null;
type CustomField =
  "servicio" | "especie" | "publico" | "requisito" | "documento" | "exclusion";

function localDraftKey(eventId?: string) {
  return `@pawalert_event_editor_${eventId || "new"}`;
}

function dateLabel(date: string, time: string) {
  if (!date || !time) return "Seleccionar fecha y hora";
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return "Seleccionar fecha y hora";
  return parsed.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summaryValue(items: string[], other = "") {
  return [...items, other.trim()].filter(Boolean).join(", ") || "Por definir";
}

export default function EventEditorScreen({
  eventId,
  onClose,
  onEventCreated,
  presentation = "screen",
}: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const { token, user } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<EventEditorValues>(() =>
    createInitialEventValues(user?.id),
  );
  const [currentEventId, setCurrentEventId] = useState(eventId);
  const [existingEvent, setExistingEvent] =
    useState<EventAssociationView | null>(null);
  const [lifecycleState, setLifecycleState] = useState<EventState>("borrador");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(eventId));
  const [isSaving, setIsSaving] = useState(false);
  const [dateTarget, setDateTarget] = useState<DateTarget>(null);
  const [customFields, setCustomFields] = useState<Set<CustomField>>(new Set());
  const [imageAsset, setImageAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [remoteImage, setRemoteImage] = useState<RemoteImageState | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const saveKeyRef = useRef<string | null>(null);
  const imageKeyRef = useRef<string | null>(null);
  const createdEventIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const patchValues = (patch: Partial<EventEditorValues>) =>
    setValues((current) => ({ ...current, ...patch }));
  const previewUri =
    imageAsset?.uri ||
    (!imageRemoved ? remoteImage?.url || existingEvent?.imagen_url : null);
  const validationOptions = useMemo(
    () => ({ hasImage: Boolean(previewUri) }),
    [previewUri],
  );
  const stepIssues = useMemo(
    () => getEventStepIssues(values, validationOptions),
    [validationOptions, values],
  );
  const completed = useMemo(
    () => getEventStepCompletion(values, validationOptions),
    [validationOptions, values],
  );
  const incompleteSteps = useMemo(
    () => getIncompleteEventSteps(completed),
    [completed],
  );
  const publishReady = incompleteSteps.length === 0;
  const lifecycleEditable = ["borrador", "publicado", "pausado"].includes(
    lifecycleState,
  );
  const generatedDescription = useMemo(
    () => generateEventDescription(values),
    [values],
  );
  const clinical =
    values.tipo === "vacunacion" || values.tipo === "esterilizacion";

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (eventId && createdEventIdRef.current === eventId) {
        createdEventIdRef.current = null;
        if (active) setIsLoading(false);
        return;
      }
      if (!token) {
        if (active) setIsLoading(false);
        return;
      }
      try {
        const [staffResponse, savedDraft] = await Promise.all([
          axios.get<StaffMember[]>(`${API_URL}/associations/me/staff`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          AsyncStorage.getItem(localDraftKey(eventId)),
        ]);
        if (!active) return;
        setStaff(staffResponse.data || []);
        let base = createInitialEventValues(user?.id);
        if (eventId) {
          const events = await listAssociationEvents(token, { limite: 250 });
          const found = events.find((event) => event.id === eventId);
          if (!found) throw new Error("El evento ya no está disponible.");
          setExistingEvent(found);
          setLifecycleState(found.estado);
          base = eventValuesFromAssociation(found);
        }
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft) as {
            values?: EventEditorValues;
            step?: number;
          };
          base = parsed.values ? { ...base, ...parsed.values } : base;
          if (parsed.step) setStep(Math.min(5, Math.max(1, parsed.step)));
        }
        setValues(base);
        setCustomFields(
          new Set(
            [
              base.servicioOtro && "servicio",
              base.especieOtra && "especie",
              base.publicoOtro && "publico",
              base.requisitoOtro && "requisito",
              base.documentoOtro && "documento",
              base.exclusionOtra && "exclusion",
            ].filter(Boolean) as CustomField[],
          ),
        );
      } catch (error) {
        showToast({
          type: "error",
          title: "No pudimos abrir el editor",
          message: normalizeEventApiError(error).message,
        });
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [eventId, showToast, token, user?.id]);

  const persistLocal = async () => {
    await AsyncStorage.setItem(
      localDraftKey(currentEventId),
      JSON.stringify({ values, step }),
    );
  };

  const pickImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast({
          type: "warning",
          title: "Permiso necesario",
          message:
            "Autoriza el acceso a tus imágenes para seleccionar una fotografía.",
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.82,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        setImageAsset(asset);
        setImageRemoved(false);
        if (!values.textoAlternativo.trim())
          patchValues({
            textoAlternativo: `Imagen de ${values.titulo.trim() || "evento comunitario"}`,
          });
      }
    } catch {
      showToast({
        type: "error",
        title: "No pudimos abrir tus imágenes",
        message: "Intenta nuevamente o continúa sin imagen principal.",
      });
    }
  };

  const selectCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        showToast({
          type: "warning",
          title: "Ubicación no disponible",
          message: "Puedes elegir manualmente el punto en el mapa.",
        });
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      patchValues({
        latitud: position.coords.latitude,
        longitud: position.coords.longitude,
      });
    } catch {
      showToast({
        type: "error",
        title: "Ubicación no disponible",
        message: "Elige manualmente el punto autorizado en el mapa.",
      });
    }
  };

  const imageFormData = async () => {
    if (!imageAsset) return null;
    const form = new FormData();
    if (Platform.OS === "web") {
      const file =
        imageAsset.file || (await (await fetch(imageAsset.uri)).blob());
      form.append("image", file, imageAsset.fileName || "evento.jpg");
    } else {
      form.append("image", {
        uri: imageAsset.uri,
        name: imageAsset.fileName || "evento.jpg",
        type: imageAsset.mimeType || "image/jpeg",
      } as never);
    }
    form.append("alternative_text", values.textoAlternativo.trim());
    form.append(
      "idempotency_key",
      imageKeyRef.current ||
        createEventIdempotencyKey("image", currentEventId || "new"),
    );
    return form;
  };

  const synchronizeDraft = async (notify = true): Promise<string | null> => {
    if (!token) {
      showToast({
        type: "error",
        title: "Sesión requerida",
        message: "Inicia sesión nuevamente para guardar el evento.",
      });
      return null;
    }
    if (!acquireEventActionLock(savingRef)) return null;
    if (previewUri && !values.textoAlternativo.trim()) {
      showToast({
        type: "warning",
        title: "Falta describir la imagen",
        message: "Agrega el texto alternativo antes de guardar el borrador.",
      });
      return null;
    }
    Keyboard.dismiss();
    setIsSaving(true);
    try {
      await persistLocal();
      saveKeyRef.current ||= createEventIdempotencyKey(
        currentEventId ? "update" : "create",
        currentEventId,
      );
      const data = eventValuesToWriteData(values);
      let savedEventId = currentEventId;
      if (currentEventId) {
        try {
          const response = await updateAssociationEvent(token, currentEventId, {
            datos: data,
            idempotency_key: saveKeyRef.current,
          });
          savedEventId = response.id;
        } catch (error) {
          const normalized = normalizeEventApiError(error);
          if (
            normalized.status !== 409 ||
            normalized.message !==
              "La actualización no modifica ningún dato del evento."
          ) {
            throw error;
          }
          savedEventId = currentEventId;
        }
      } else {
        const response = await createAssociationEvent(token, {
          datos: data,
          idempotency_key: saveKeyRef.current,
        });
        savedEventId = response.id;
      }
      if (!savedEventId) throw new Error("No se pudo identificar el borrador.");
      if (!currentEventId) {
        await AsyncStorage.removeItem(localDraftKey());
        setCurrentEventId(savedEventId);
        await AsyncStorage.setItem(
          localDraftKey(savedEventId),
          JSON.stringify({ values, step }),
        );
        createdEventIdRef.current = savedEventId;
        onEventCreated?.(savedEventId);
      }
      saveKeyRef.current = null;

      if (imageRemoved && (remoteImage?.url || existingEvent?.imagen_url)) {
        imageKeyRef.current ||= createEventIdempotencyKey(
          "remove-image",
          savedEventId,
        );
        await removeAssociationEventImage(token, savedEventId, {
          idempotency_key: imageKeyRef.current,
        });
        imageKeyRef.current = null;
        setExistingEvent((current) =>
          current
            ? { ...current, imagen_url: null, imagen_texto_alternativo: null }
            : current,
        );
        setRemoteImage(null);
      } else if (imageAsset) {
        imageKeyRef.current ||= createEventIdempotencyKey(
          "image",
          savedEventId,
        );
        const form = await imageFormData();
        if (form) {
          const imageResponse = await replaceAssociationEventImage(
            token,
            savedEventId,
            form,
          );
          if (imageResponse.imagen_url) {
            setRemoteImage({
              url: imageResponse.imagen_url,
              expiresAt: imageResponse.imagen_url_expira_at,
              alternativeText: imageResponse.imagen_texto_alternativo,
            });
          }
        }
        imageKeyRef.current = null;
        setImageAsset(null);
      }
      await AsyncStorage.setItem(
        localDraftKey(savedEventId),
        JSON.stringify({ values, step }),
      );
      setImageRemoved(false);
      if (notify) {
        const isDraft = lifecycleState === "borrador";
        showToast({
          type: "success",
          title: isDraft ? "Borrador guardado" : "Cambios guardados",
          message: isDraft
            ? "Tu avance quedó guardado y puedes continuar después."
            : "La información del evento quedó actualizada.",
        });
      }
      return savedEventId;
    } catch (error) {
      const message = normalizeEventApiError(error).message;
      showToast({ type: "error", title: "No pudimos guardar", message });
      return null;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const saveDraft = async () => {
    await synchronizeDraft(true);
  };

  const saveLocallyAndExit = async () => {
    if (!acquireEventActionLock(savingRef)) return;
    Keyboard.dismiss();
    setIsSaving(true);
    try {
      await persistLocal();
      setShowExit(false);
      onClose();
    } catch {
      showToast({
        type: "error",
        title: "No pudimos guardar en el dispositivo",
        message: "Sigue editando e intenta salir nuevamente.",
      });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleLifecycleSuccess = async (
    response: EventOperationResponse,
    action: EventLifecycleAction,
  ) => {
    const wasPaused = lifecycleState === "pausado";
    setLifecycleState(response.estado);
    setExistingEvent((current) =>
      current
        ? {
            ...current,
            estado: response.estado,
            version_publica: response.version_publica,
            actualizada_at: response.updated_at,
          }
        : current,
    );
    showToast({
      type: "success",
      title:
        action === "publish"
          ? wasPaused
            ? "Evento reanudado"
            : "Evento publicado"
          : action === "pause"
            ? "Evento pausado"
            : "Evento cancelado",
      message:
        action === "publish"
          ? "La agenda comunitaria ya refleja el evento publicado."
          : action === "pause"
            ? "El evento dejó de mostrarse temporalmente en la agenda pública."
            : "La cancelación y su motivo quedaron registrados.",
    });
  };

  const toggleCustom = (field: CustomField) => {
    if (customFields.has(field)) {
      const emptyValueByField: Record<
        CustomField,
        Partial<EventEditorValues>
      > = {
        servicio: { servicioOtro: "" },
        especie: { especieOtra: "" },
        publico: { publicoOtro: "" },
        requisito: { requisitoOtro: "" },
        documento: { documentoOtro: "" },
        exclusion: { exclusionOtra: "" },
      };
      patchValues(emptyValueByField[field]);
    }
    setCustomFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const otherButton = (field: CustomField, label: string) => (
    <TouchableOpacity
      onPress={() => toggleCustom(field)}
      style={styles.otherButton}
    >
      <Ionicons
        name={
          customFields.has(field)
            ? "remove-circle-outline"
            : "add-circle-outline"
        }
        size={17}
        color={EventTheme.colors.primary}
      />
      <Text style={styles.otherButtonText}>
        {customFields.has(field) ? "Quitar opción personalizada" : label}
      </Text>
    </TouchableOpacity>
  );

  const renderStepOne = () => (
    <View style={styles.sections}>
      <EventFormSection
        title="¿Qué tipo de evento es?"
        description="Elige la categoría que mejor representa la actividad."
      >
        <EventOptionChips
          options={EVENT_TYPE_OPTIONS}
          selected={values.tipo ? [values.tipo] : []}
          multiple={false}
          onToggle={(tipo) =>
            patchValues(
              (() => {
                const nextClinical =
                  tipo === "vacunacion" || tipo === "esterilizacion";
                const currentClinical =
                  values.tipo === "vacunacion" ||
                  values.tipo === "esterilizacion";
                return {
                  tipo,
                  categoriaOtro: tipo === "otro" ? values.categoriaOtro : "",
                  servicios: [],
                  servicioOtro: "",
                  responsableProfesional: nextClinical
                    ? currentClinical
                      ? values.responsableProfesional
                      : ""
                    : "",
                  cedulaProfesional: nextClinical
                    ? currentClinical
                      ? values.cedulaProfesional
                      : ""
                    : "",
                  institucionProfesional: nextClinical
                    ? currentClinical
                      ? values.institucionProfesional
                      : ""
                    : "",
                  datosProfesionalesEstado: nextClinical
                    ? currentClinical
                      ? values.datosProfesionalesEstado
                      : "declarado"
                    : "no_aplica",
                };
              })(),
            )
          }
        />
        {values.tipo === "otro" && (
          <EventTextField
            label="Categoría del evento"
            required
            value={values.categoriaOtro}
            maxLength={120}
            onChangeText={(categoriaOtro) => patchValues({ categoriaOtro })}
            placeholder="Ej. Jornada informativa"
          />
        )}
      </EventFormSection>
      <EventFormSection
        title="Título"
        description="Puedes partir de una sugerencia y ajustarla a tu evento."
      >
        {!!values.tipo && (
          <EventOptionChips
            options={EVENT_TITLE_SUGGESTIONS[values.tipo]}
            selected={
              EVENT_TITLE_SUGGESTIONS[values.tipo].includes(values.titulo)
                ? [values.titulo]
                : []
            }
            multiple={false}
            onToggle={(titulo) => patchValues({ titulo })}
          />
        )}
        <EventTextField
          label="Título público"
          required
          value={values.titulo}
          maxLength={180}
          onChangeText={(titulo) => patchValues({ titulo })}
          placeholder="Nombre breve y claro"
        />
      </EventFormSection>
      {!!values.tipo && (
        <EventFormSection
          title="Servicios o actividades"
          description="Selecciona todo lo que las personas podrán encontrar."
        >
          <EventOptionChips
            options={EVENT_SERVICE_OPTIONS[values.tipo]}
            selected={values.servicios}
            onToggle={(option) =>
              patchValues({
                servicios: toggleEventOption(values.servicios, option),
              })
            }
          />
          {otherButton("servicio", "Agregar otro servicio")}
          {customFields.has("servicio") && (
            <EventTextField
              label="Otro servicio"
              value={values.servicioOtro}
              onChangeText={(servicioOtro) => patchValues({ servicioOtro })}
              placeholder="Describe el servicio en una frase"
            />
          )}
        </EventFormSection>
      )}
      <EventFormSection
        title="Descripción pública"
        description="PawAlert genera una descripción a partir de tus selecciones."
      >
        {!values.descripcionPersonalizada ? (
          <View style={styles.generatedBox}>
            <Ionicons
              name="sparkles-outline"
              size={20}
              color={EventTheme.colors.primary}
            />
            <Text style={styles.generatedText}>{generatedDescription}</Text>
          </View>
        ) : (
          <EventTextField
            label="Descripción personalizada"
            required
            multiline
            maxLength={4000}
            value={values.descripcion}
            onChangeText={(descripcion) => patchValues({ descripcion })}
          />
        )}
        <TouchableOpacity
          onPress={() =>
            patchValues({
              descripcionPersonalizada: !values.descripcionPersonalizada,
              descripcion: values.descripcionPersonalizada
                ? ""
                : generatedDescription,
            })
          }
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            {values.descripcionPersonalizada
              ? "Usar descripción generada"
              : "Personalizar descripción"}
          </Text>
        </TouchableOpacity>
      </EventFormSection>
    </View>
  );

  const renderStepTwo = () => (
    <View style={styles.sections}>
      <EventFormSection
        title="Fecha y horario"
        description="El horario se conservará en la zona elegida, aunque quien consulte esté en otra región."
      >
        <View style={[styles.twoColumns, compact && styles.oneColumn]}>
          <TouchableOpacity
            onPress={() => setDateTarget("inicio")}
            style={styles.dateButton}
          >
            <Ionicons
              name="calendar-outline"
              size={21}
              color={EventTheme.colors.primary}
            />
            <View style={styles.dateCopy}>
              <Text style={styles.dateLabel}>Inicio</Text>
              <Text style={styles.dateValue}>
                {dateLabel(values.fechaInicio, values.horaInicio)}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDateTarget("fin")}
            style={styles.dateButton}
          >
            <Ionicons
              name="flag-outline"
              size={21}
              color={EventTheme.colors.primary}
            />
            <View style={styles.dateCopy}>
              <Text style={styles.dateLabel}>Finalización</Text>
              <Text style={styles.dateValue}>
                {dateLabel(values.fechaFin, values.horaFin)}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        <EventChoiceField label="Zona horaria" required>
          <EventOptionChips
            options={TIME_ZONE_OPTIONS}
            selected={[
              values.zonaHoraria as (typeof TIME_ZONE_OPTIONS)[number]["value"],
            ]}
            multiple={false}
            onToggle={(zonaHoraria) => patchValues({ zonaHoraria })}
          />
        </EventChoiceField>
      </EventFormSection>
      <EventFormSection
        title="Lugar público"
        description="Coloca el pin en el establecimiento o punto autorizado donde se realizará la actividad."
      >
        <EventLocationPicker
          latitud={values.latitud}
          longitud={values.longitud}
          onChange={(latitud, longitud) => patchValues({ latitud, longitud })}
        />
        <TouchableOpacity
          onPress={() => void selectCurrentLocation()}
          style={styles.locationButton}
        >
          <Ionicons
            name="navigate-outline"
            size={18}
            color={EventTheme.colors.primary}
          />
          <Text style={styles.locationButtonText}>
            Usar mi ubicación como referencia
          </Text>
        </TouchableOpacity>
        <EventTextField
          label="Nombre del lugar"
          required
          value={values.lugarNombre}
          maxLength={200}
          onChangeText={(lugarNombre) => patchValues({ lugarNombre })}
          placeholder="Ej. Centro comunitario San José"
        />
        <EventTextField
          label="Dirección pública"
          required
          value={values.direccionPublica}
          maxLength={500}
          onChangeText={(direccionPublica) => patchValues({ direccionPublica })}
          placeholder="Calle, número y colonia"
        />
        <View style={[styles.twoColumns, compact && styles.oneColumn]}>
          <View style={styles.column}>
            <EventTextField
              label="Municipio"
              required
              value={values.municipio}
              maxLength={120}
              onChangeText={(municipio) => patchValues({ municipio })}
            />
          </View>
          <View style={styles.column}>
            <EventTextField
              label="Estado"
              required
              value={values.estadoUbicacion}
              maxLength={120}
              onChangeText={(estadoUbicacion) =>
                patchValues({ estadoUbicacion })
              }
            />
          </View>
        </View>
      </EventFormSection>
    </View>
  );

  const renderSelectionGroup = (
    title: string,
    options: string[],
    selected: string[],
    onChange: (next: string[]) => void,
    custom: CustomField,
    customValue: string,
    setCustomValue: (value: string) => void,
    exclusive?: string,
  ) => (
    <EventFormSection title={title}>
      <EventOptionChips
        options={options}
        selected={selected}
        onToggle={(option) =>
          onChange(toggleEventOption(selected, option, exclusive))
        }
      />
      {otherButton(
        custom,
        `Agregar ${custom === "especie" ? "otra especie" : custom === "publico" ? "otro público" : custom === "documento" ? "otro documento" : custom === "exclusion" ? "otra condición" : "otro requisito"}`,
      )}
      {customFields.has(custom) && (
        <EventTextField
          label="Opción personalizada"
          value={customValue}
          onChangeText={setCustomValue}
          placeholder="Escribe una opción breve"
        />
      )}
    </EventFormSection>
  );

  const renderStepThree = () => (
    <View style={styles.sections}>
      {renderSelectionGroup(
        "Especies objetivo",
        SPECIES_OPTIONS,
        values.especies,
        (especies) => patchValues({ especies }),
        "especie",
        values.especieOtra,
        (especieOtra) => patchValues({ especieOtra }),
      )}
      {renderSelectionGroup(
        "Público objetivo",
        AUDIENCE_OPTIONS,
        values.publicos,
        (publicos) => patchValues({ publicos }),
        "publico",
        values.publicoOtro,
        (publicoOtro) => patchValues({ publicoOtro }),
      )}
      <EventFormSection
        title="Modalidad de acceso"
        description="Guardar el evento en PawAlert no registra ni reserva un lugar."
      >
        <EventOptionChips
          options={ACCESS_MODE_OPTIONS}
          selected={values.modalidadAcceso ? [values.modalidadAcceso] : []}
          multiple={false}
          onToggle={(modalidadAcceso) =>
            patchValues({
              modalidadAcceso,
              enlaceRegistro:
                modalidadAcceso === "registro_externo"
                  ? values.enlaceRegistro
                  : "",
              instruccionesContacto:
                modalidadAcceso === "contacto_institucional"
                  ? values.instruccionesContacto
                  : "",
            })
          }
        />
        {values.modalidadAcceso === "registro_externo" && (
          <EventTextField
            autoCapitalize="none"
            keyboardType="url"
            label="Enlace oficial de registro"
            required
            value={values.enlaceRegistro}
            maxLength={1000}
            onChangeText={(enlaceRegistro) => patchValues({ enlaceRegistro })}
            placeholder="https://..."
          />
        )}
        {values.modalidadAcceso === "contacto_institucional" && (
          <EventTextField
            label="Instrucciones para registrarse"
            required
            multiline
            value={values.instruccionesContacto}
            maxLength={1000}
            onChangeText={(instruccionesContacto) =>
              patchValues({ instruccionesContacto })
            }
            placeholder="Ej. Llama al teléfono institucional de lunes a viernes"
          />
        )}
      </EventFormSection>
      {renderSelectionGroup(
        "Requisitos para asistir",
        REQUIREMENT_OPTIONS,
        values.requisitos,
        (requisitos) => patchValues({ requisitos }),
        "requisito",
        values.requisitoOtro,
        (requisitoOtro) => patchValues({ requisitoOtro }),
        "Sin requisitos adicionales",
      )}
      {renderSelectionGroup(
        "Documentos requeridos",
        DOCUMENT_OPTIONS,
        values.documentos,
        (documentos) => patchValues({ documentos }),
        "documento",
        values.documentoOtro,
        (documentoOtro) => patchValues({ documentoOtro }),
        "Ninguno",
      )}
      {renderSelectionGroup(
        "Condiciones que no pueden atenderse",
        EXCLUSION_OPTIONS,
        values.exclusiones,
        (exclusiones) => patchValues({ exclusiones }),
        "exclusion",
        values.exclusionOtra,
        (exclusionOtra) => patchValues({ exclusionOtra }),
        "Ninguna exclusión",
      )}
    </View>
  );

  const staffOptions = useMemo(() => {
    const members = staff.map((member) => ({
      value: member.id,
      label: `${member.nombre} ${member.apellido_paterno || ""}`.trim(),
      description: member.email || undefined,
    }));
    if (user?.id && !members.some((member) => member.value === user.id))
      members.unshift({
        value: user.id,
        label: `${user.nombre} ${user.apellido_paterno || ""}`.trim(),
        description: "Usuario actual",
      });
    return members;
  }, [staff, user]);

  const renderStepFour = () => (
    <View style={styles.sections}>
      <EventFormSection
        title="Costo"
        description="PawAlert no procesa pagos; esta información solo comunica el costo del evento."
      >
        <EventChoiceField label="¿La actividad es gratuita?" required>
          <EventOptionChips
            options={[
              { value: "si", label: "Sí, es gratuita" },
              { value: "no", label: "No, tiene costo" },
            ]}
            selected={
              values.esGratuito == null ? [] : [values.esGratuito ? "si" : "no"]
            }
            multiple={false}
            onToggle={(option) =>
              patchValues({
                esGratuito: option === "si",
                costo: option === "si" ? "" : values.costo,
              })
            }
          />
        </EventChoiceField>
        {values.esGratuito === false && (
          <>
            <EventOptionChips
              options={COST_MODE_OPTIONS}
              selected={[values.modoCosto]}
              multiple={false}
              onToggle={(modoCosto) => patchValues({ modoCosto })}
            />
            <EventTextField
              keyboardType="decimal-pad"
              label="Cantidad en pesos mexicanos"
              required
              value={values.costo}
              onChangeText={(costo) =>
                patchValues({ costo: costo.replace(/[^0-9.,]/g, "") })
              }
              placeholder="0.00"
            />
          </>
        )}
      </EventFormSection>
      <EventFormSection title="Cupo">
        <EventChoiceField label="¿Existe un límite de lugares?" required>
          <EventOptionChips
            options={[
              { value: "sin_limite", label: "Sin límite informado" },
              { value: "limitado", label: "Cupo limitado" },
            ]}
            selected={
              values.cupoLimitado == null
                ? []
                : [values.cupoLimitado ? "limitado" : "sin_limite"]
            }
            multiple={false}
            onToggle={(option) =>
              patchValues({
                cupoLimitado: option === "limitado",
                cupoTotal: option === "limitado" ? values.cupoTotal : "",
                cupoAgotado: false,
              })
            }
          />
        </EventChoiceField>
        {values.cupoLimitado && (
          <>
            <EventTextField
              keyboardType="number-pad"
              label="Número de lugares"
              required
              value={values.cupoTotal}
              onChangeText={(cupoTotal) =>
                patchValues({ cupoTotal: cupoTotal.replace(/\D/g, "") })
              }
            />
            <EventOptionChips
              options={[
                { value: "disponible", label: "Cupo disponible" },
                { value: "agotado", label: "Cupo agotado" },
              ]}
              selected={[values.cupoAgotado ? "agotado" : "disponible"]}
              multiple={false}
              onToggle={(option) =>
                patchValues({ cupoAgotado: option === "agotado" })
              }
            />
          </>
        )}
      </EventFormSection>
      <EventFormSection
        title="Responsable operativo"
        description="Selecciona a una persona de la asociación que pueda atender cambios y seguimiento del evento."
      >
        <EventOptionChips
          options={staffOptions}
          selected={
            values.responsableOperativoId ? [values.responsableOperativoId] : []
          }
          multiple={false}
          onToggle={(responsableOperativoId) =>
            patchValues({ responsableOperativoId })
          }
        />
      </EventFormSection>
      <EventFormSection
        title="Contacto institucional"
        description="Usa únicamente información oficial de la asociación, nunca datos privados de voluntarios."
      >
        <EventTextField
          label="Nombre del contacto"
          required
          value={values.contactoNombre}
          maxLength={200}
          onChangeText={(contactoNombre) => patchValues({ contactoNombre })}
        />
        <View style={[styles.twoColumns, compact && styles.oneColumn]}>
          <View style={styles.column}>
            <EventTextField
              keyboardType="phone-pad"
              label="Teléfono"
              value={values.contactoTelefono}
              maxLength={30}
              onChangeText={(contactoTelefono) =>
                patchValues({ contactoTelefono })
              }
            />
          </View>
          <View style={styles.column}>
            <EventTextField
              autoCapitalize="none"
              keyboardType="email-address"
              label="Correo"
              value={values.contactoEmail}
              maxLength={255}
              onChangeText={(contactoEmail) => patchValues({ contactoEmail })}
            />
          </View>
        </View>
        <Text style={styles.fieldNote}>
          Debes indicar al menos teléfono o correo.
        </Text>
      </EventFormSection>
      {clinical && (
        <EventFormSection
          title="Responsable profesional"
          description="Estos datos se mostrarán como declarados por la asociación. Solo administración puede verificarlos."
        >
          <EventTextField
            label="Nombre del profesional"
            required
            value={values.responsableProfesional}
            maxLength={250}
            onChangeText={(responsableProfesional) =>
              patchValues({ responsableProfesional })
            }
          />
          <View style={[styles.twoColumns, compact && styles.oneColumn]}>
            <View style={styles.column}>
              <EventTextField
                label="Cédula profesional"
                value={values.cedulaProfesional}
                maxLength={100}
                onChangeText={(cedulaProfesional) =>
                  patchValues({ cedulaProfesional })
                }
              />
            </View>
            <View style={styles.column}>
              <EventTextField
                label="Institución o clínica"
                value={values.institucionProfesional}
                maxLength={250}
                onChangeText={(institucionProfesional) =>
                  patchValues({ institucionProfesional })
                }
              />
            </View>
          </View>
          <View style={styles.declaredBadge}>
            <Ionicons
              name={
                values.datosProfesionalesEstado === "verificado"
                  ? "shield-checkmark"
                  : "information-circle"
              }
              size={18}
              color={EventTheme.colors.secondary}
            />
            <Text style={styles.declaredText}>
              {values.datosProfesionalesEstado === "verificado"
                ? "Datos verificados por PawAlert"
                : "Datos declarados por la asociación"}
            </Text>
          </View>
        </EventFormSection>
      )}
    </View>
  );

  const lifecycleNoticeTitle =
    lifecycleState === "publicado"
      ? "El evento está publicado"
      : lifecycleState === "pausado"
        ? publishReady
          ? "El evento está listo para reanudarse"
          : "Completa la información antes de reanudar"
        : lifecycleState === "borrador"
          ? publishReady
            ? "El evento está listo para publicarse"
            : "Completa la información pendiente"
          : "El evento ya no admite cambios ordinarios";
  const lifecycleNoticeText =
    lifecycleState === "publicado"
      ? "Puedes guardar cambios, pausarlo temporalmente o cancelarlo desde esta revisión."
      : lifecycleState === "pausado" || lifecycleState === "borrador"
        ? publishReady
          ? "Antes de continuar guardaremos cualquier cambio pendiente y confirmaremos la operación."
          : `Falta revisar: ${incompleteSteps.join(", ")}.`
        : "Consulta su estado en el inventario de la asociación.";
  const lifecycleNoticePositive =
    lifecycleState === "publicado" ||
    ((lifecycleState === "borrador" || lifecycleState === "pausado") &&
      publishReady);
  const renderStepFive = () => (
    <View style={styles.sections}>
      <EventFormSection
        title="Imagen principal"
        description="Es opcional, pero ayuda a reconocer el evento. Se aceptan JPG, PNG o WebP."
      >
        {previewUri ? (
          <View style={styles.imagePreviewWrap}>
            <Image
              source={{ uri: previewUri }}
              resizeMode="cover"
              style={styles.imagePreview}
            />
            <View style={styles.imageActions}>
              <TouchableOpacity
                onPress={() => void pickImage()}
                style={styles.imageAction}
              >
                <Ionicons
                  name="images-outline"
                  size={18}
                  color={EventTheme.colors.primary}
                />
                <Text style={styles.imageActionText}>Reemplazar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setImageAsset(null);
                  setImageRemoved(true);
                  patchValues({ textoAlternativo: "" });
                }}
                style={styles.imageAction}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={EventTheme.colors.danger}
                />
                <Text
                  style={[
                    styles.imageActionText,
                    { color: EventTheme.colors.danger },
                  ]}
                >
                  Eliminar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => void pickImage()}
            style={styles.imagePicker}
          >
            <Ionicons
              name="image-outline"
              size={34}
              color={EventTheme.colors.primary}
            />
            <Text style={styles.imagePickerTitle}>Seleccionar imagen</Text>
            <Text style={styles.imagePickerHint}>
              Se recortará en formato horizontal 16:9
            </Text>
          </TouchableOpacity>
        )}
        {!!previewUri && (
          <EventTextField
            label="Texto alternativo"
            required
            value={values.textoAlternativo}
            maxLength={500}
            editable={Boolean(imageAsset)}
            onChangeText={(textoAlternativo) =>
              patchValues({ textoAlternativo })
            }
            hint={
              imageAsset
                ? "Describe brevemente lo importante de la imagen para lectores de pantalla."
                : "Para cambiar este texto, reemplaza la imagen y guarda la nueva versión."
            }
          />
        )}
      </EventFormSection>
      <EventFormSection
        title="Revisión del borrador"
        description="Puedes volver a cualquier paso para completar o corregir información."
      >
        <View style={styles.currentStateRow}>
          <Text style={styles.currentStateLabel}>Estado actual</Text>
          <EventStatusChip state={lifecycleState} />
        </View>
        {[
          [
            "Tipo",
            values.categoriaOtro ||
              EVENT_TYPE_OPTIONS.find((option) => option.value === values.tipo)
                ?.label ||
              "Por definir",
          ],
          ["Título", values.titulo || "Por definir"],
          [
            "Horario",
            `${dateLabel(values.fechaInicio, values.horaInicio)} – ${dateLabel(values.fechaFin, values.horaFin)}`,
          ],
          [
            "Lugar",
            [values.lugarNombre, values.municipio, values.estadoUbicacion]
              .filter(Boolean)
              .join(", ") || "Por definir",
          ],
          ["Especies", summaryValue(values.especies, values.especieOtra)],
          ["Público", summaryValue(values.publicos, values.publicoOtro)],
          [
            "Costo",
            values.esGratuito == null
              ? "Por definir"
              : values.esGratuito
                ? "Gratuito"
                : `$${values.costo || "0"} MXN`,
          ],
        ].map(([label, value]) => (
          <View key={label} style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>{label}</Text>
            <Text style={styles.reviewValue}>{value}</Text>
          </View>
        ))}
        <View style={styles.completionList}>
          {EVENT_FORM_STEPS.map((label, index) => (
            <TouchableOpacity
              key={label}
              onPress={() => setStep(index + 1)}
              style={styles.completionRow}
            >
              <Ionicons
                name={
                  completed[index] ? "checkmark-circle" : "alert-circle-outline"
                }
                size={20}
                color={
                  completed[index]
                    ? EventTheme.colors.secondary
                    : EventTheme.colors.accent
                }
              />
              <Text style={styles.completionText}>{label}</Text>
              <Ionicons
                name="chevron-forward"
                size={17}
                color={EventTheme.colors.textFaint}
              />
            </TouchableOpacity>
          ))}
        </View>
        <View
          style={[
            styles.draftNotice,
            lifecycleNoticePositive && styles.publishReadyNotice,
          ]}
        >
          <Ionicons
            name={
              lifecycleNoticePositive
                ? "checkmark-circle-outline"
                : "alert-circle-outline"
            }
            size={21}
            color={
              lifecycleNoticePositive
                ? EventTheme.colors.secondary
                : EventTheme.colors.primary
            }
          />
          <View style={styles.draftNoticeCopy}>
            <Text style={styles.draftNoticeTitle}>{lifecycleNoticeTitle}</Text>
            <Text style={styles.draftNoticeText}>{lifecycleNoticeText}</Text>
          </View>
        </View>
        <EventLifecycleActions
          disabled={isSaving}
          eventId={currentEventId}
          onError={(message) =>
            showToast({
              type: "error",
              title: "No pudimos cambiar el estado",
              message,
            })
          }
          onPreparePublish={() => synchronizeDraft(false)}
          onSuccess={handleLifecycleSuccess}
          publishReady={publishReady}
          state={lifecycleState}
        />
      </EventFormSection>
    </View>
  );

  const renderCurrentStep = () => (
    <View style={styles.sections}>
      {[
        renderStepOne,
        renderStepTwo,
        renderStepThree,
        renderStepFour,
        renderStepFive,
      ][step - 1]()}
      <EventValidationSummary issues={stepIssues[step - 1]} />
    </View>
  );

  if (isLoading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={EventTheme.colors.primary} />
        <Text style={styles.loadingText}>Preparando el editor…</Text>
      </View>
    );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <Toast toast={toast} translateY={translateY} />
      <View
        style={[
          styles.shell,
          !compact && presentation === "screen" && styles.shellDesktop,
          presentation === "modal" && styles.shellModal,
        ]}
      >
        <EventProgressHeader
          step={step}
          completed={completed}
          disabled={isSaving}
          onClose={() => setShowExit(true)}
        />
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={isSaving ? styles.interactionsDisabled : undefined}>
            {renderCurrentStep()}
          </View>
        </ScrollView>
        <View style={[styles.footer, compact && styles.footerCompact]}>
          <TouchableOpacity
            disabled={step === 1 || isSaving}
            onPress={() => setStep((current) => Math.max(1, current - 1))}
            style={[
              styles.secondaryButton,
              compact && styles.footerButtonCompact,
              step === 1 && styles.buttonDisabled,
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={EventTheme.colors.text}
            />
            <Text style={styles.secondaryButtonText}>Anterior</Text>
          </TouchableOpacity>
          {lifecycleEditable && (
            <TouchableOpacity
              disabled={isSaving}
              onPress={() => void saveDraft()}
              style={[styles.saveButton, compact && styles.footerButtonCompact]}
            >
              {isSaving ? (
                <ActivityIndicator color={EventTheme.colors.primary} />
              ) : (
                <>
                  <Ionicons
                    name="cloud-upload-outline"
                    size={18}
                    color={EventTheme.colors.primary}
                  />
                  <Text style={styles.saveButtonText}>
                    {lifecycleState === "borrador"
                      ? "Guardar borrador"
                      : "Guardar cambios"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {step < 5 && (
            <TouchableOpacity
              disabled={isSaving}
              onPress={() => setStep((current) => Math.min(5, current + 1))}
              style={[
                styles.primaryButton,
                compact && styles.footerButtonCompact,
              ]}
            >
              <Text style={styles.primaryButtonText}>Siguiente</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={EventTheme.colors.surface}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <EventDateTimeModal
        key={dateTarget || "closed"}
        visible={dateTarget != null}
        title={
          dateTarget === "inicio"
            ? "Inicio del evento"
            : "Finalización del evento"
        }
        date={dateTarget === "inicio" ? values.fechaInicio : values.fechaFin}
        time={dateTarget === "inicio" ? values.horaInicio : values.horaFin}
        onClose={() => setDateTarget(null)}
        onConfirm={(date, time) => {
          if (dateTarget === "inicio")
            patchValues({ fechaInicio: date, horaInicio: time });
          else patchValues({ fechaFin: date, horaFin: time });
          setDateTarget(null);
        }}
      />

      <AppModal
        fitContent
        visible={showExit}
        onClose={() => setShowExit(false)}
        maxWidth={480}
        dismissable={!isSaving}
      >
        <View style={styles.exitModal}>
          <View style={styles.exitIcon}>
            <Ionicons
              name="document-text-outline"
              size={28}
              color={EventTheme.colors.primary}
            />
          </View>
          <Text style={styles.exitTitle}>¿Salir del editor?</Text>
          <Text style={styles.exitText}>
            Guardaremos este avance en el dispositivo. Usa “Guardar borrador” si
            también quieres sincronizarlo con tu cuenta.
          </Text>
          <View
            style={[styles.exitActions, compact && styles.exitActionsCompact]}
          >
            <TouchableOpacity
              disabled={isSaving}
              onPress={() => setShowExit(false)}
              style={[
                styles.secondaryButton,
                isSaving && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Seguir editando</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isSaving}
              onPress={() => void saveLocallyAndExit()}
              style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
            >
              {isSaving ? (
                <ActivityIndicator color={EventTheme.colors.surface} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Guardar localmente y salir
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </AppModal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.background,
    flex: 1,
    justifyContent: "center",
  },
  shell: {
    backgroundColor: "#F9F4ED",
    flex: 1,
    overflow: "hidden",
    width: "100%",
  },
  shellDesktop: {
    borderRadius: EventTheme.radii.card,
    elevation: 5,
    flex: undefined,
    height: "94%",
    maxWidth: 940,
    shadowColor: "#4A3728",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
  },
  shellModal: {
    borderRadius: EventTheme.radii.card,
  },
  scroll: { flex: 1 },
  interactionsDisabled: { pointerEvents: "none" },
  scrollContent: { padding: 22, paddingBottom: 34 },
  sections: { gap: 18 },
  twoColumns: { flexDirection: "row", gap: 12 },
  oneColumn: { flexDirection: "column" },
  column: { flex: 1 },
  generatedBox: {
    alignItems: "flex-start",
    backgroundColor: "#FFF5EA",
    borderColor: "#F4D7BA",
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  generatedText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
  },
  linkButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
  },
  linkText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  dateButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 70,
    padding: 13,
  },
  dateLabel: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
  },
  dateCopy: { flex: 1 },
  dateValue: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 12,
    marginTop: 2,
  },
  locationButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 42,
  },
  locationButtonText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  fieldNote: {
    color: EventTheme.colors.textFaint,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
  },
  declaredBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#EAF7F6",
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  declaredText: {
    color: EventTheme.colors.secondary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  otherButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
  },
  otherButtonText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
  },
  imagePicker: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.card,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 210,
    padding: 20,
  },
  imagePickerTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 14,
    marginTop: 8,
  },
  imagePickerHint: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    marginTop: 3,
  },
  imagePreviewWrap: { borderRadius: EventTheme.radii.card, overflow: "hidden" },
  imagePreview: {
    backgroundColor: EventTheme.colors.surfaceWarm,
    height: 260,
    width: "100%",
  },
  imageActions: {
    backgroundColor: EventTheme.colors.surfaceWarm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    padding: 10,
  },
  imageAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
  },
  imageActionText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  reviewRow: {
    borderBottomColor: EventTheme.colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: 10,
  },
  reviewLabel: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
  },
  reviewValue: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 12,
  },
  currentStateRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  currentStateLabel: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
  },
  completionList: { gap: 7, marginTop: 8 },
  completionRow: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  completionText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
  },
  draftNotice: {
    alignItems: "flex-start",
    backgroundColor: "#FFF5EA",
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 9,
    padding: 13,
  },
  publishReadyNotice: { backgroundColor: "#EAF7F6" },
  draftNoticeCopy: { flex: 1 },
  draftNoticeTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  draftNoticeText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 2,
  },
  footer: {
    backgroundColor: EventTheme.colors.surface,
    borderTopColor: EventTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    padding: 14,
  },
  footerCompact: { flexWrap: "wrap" },
  footerButtonCompact: { flexBasis: "44%", flexGrow: 1 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#FFF5EA",
    borderColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  saveButtonText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  buttonDisabled: { opacity: 0.4 },
  loading: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.background,
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 12,
    marginTop: 10,
  },
  exitModal: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    justifyContent: "center",
    padding: 28,
  },
  exitIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 25,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  exitTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 19,
    marginTop: 12,
  },
  exitText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
    textAlign: "center",
  },
  exitActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  exitActionsCompact: { flexDirection: "column" },
});
