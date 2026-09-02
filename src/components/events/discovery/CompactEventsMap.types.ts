import type { EventMapFilters, EventMapItem } from '../../../types/event';

export interface CompactEventsMapProps {
  filters: Omit<EventMapFilters, 'limite'>;
  onSelectEvent: (event: EventMapItem) => void;
}
