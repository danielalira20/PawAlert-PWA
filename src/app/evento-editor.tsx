import { useLocalSearchParams, useRouter } from "expo-router";

import EventEditorScreen from "../screens/events/EventEditorScreen";

export default function EventEditorRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ event_id?: string | string[] }>();
  const eventId = Array.isArray(params.event_id)
    ? params.event_id[0]
    : params.event_id;

  return (
    <EventEditorScreen
      eventId={eventId}
      onClose={() => router.back()}
      onEventCreated={(createdId) => router.setParams({ event_id: createdId })}
    />
  );
}
