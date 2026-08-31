import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ReportModerationPanel } from "../../admin-dashboard/ReportModerationPanel";
import { EventTheme } from "../../../constants/eventTheme";
import { ACTIVE_EVENT_REPORT_STATES } from "../../../constants/eventModeration";
import { useAuth } from "../../../context/AuthContext";
import { listAdminEventIncidents } from "../../../services/eventService";
import { EventModerationPanel } from "./EventModerationPanel";

type ModerationArea = "reportes" | "eventos";

interface Props {
  onCountChange?: (count: number) => void;
  showToast: (toast: {
    type: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
  }) => void;
}

export function EventModerationWorkspace({ onCountChange, showToast }: Props) {
  const { token } = useAuth();
  const [area, setArea] = useState<ModerationArea>("reportes");
  const [reportCount, setReportCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);

  const loadEventCount = useCallback(async () => {
    if (!token) return;
    try {
      const pages = await Promise.all(
        ACTIVE_EVENT_REPORT_STATES.map((estado) =>
          listAdminEventIncidents(token, { estado, pagina: 1, limite: 1 }),
        ),
      );
      setEventCount(pages.reduce((total, page) => total + page.total, 0));
    } catch {
      // El panel mostrará su propio estado de error cuando se abra.
    }
  }, [token]);

  useEffect(() => {
    void loadEventCount();
  }, [loadEventCount]);

  useEffect(() => {
    onCountChange?.(reportCount + eventCount);
  }, [eventCount, onCountChange, reportCount]);

  return (
    <View style={styles.workspace}>
      <View accessibilityRole="tablist" style={styles.switcher}>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: area === "reportes" }}
          onPress={() => setArea("reportes")}
          style={[
            styles.switchButton,
            area === "reportes" && styles.switchActive,
          ]}
        >
          <Text
            style={[
              styles.switchText,
              area === "reportes" && styles.switchTextActive,
            ]}
          >
            Reportes
          </Text>
          {reportCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{reportCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: area === "eventos" }}
          onPress={() => setArea("eventos")}
          style={[
            styles.switchButton,
            area === "eventos" && styles.switchActive,
          ]}
        >
          <Text
            style={[
              styles.switchText,
              area === "eventos" && styles.switchTextActive,
            ]}
          >
            Eventos
          </Text>
          {eventCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{eventCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {area === "reportes" ? (
        <ReportModerationPanel
          onCountChange={setReportCount}
          showToast={showToast}
        />
      ) : (
        <EventModerationPanel
          onModerationChange={() => void loadEventCount()}
          showToast={showToast}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1 },
  switcher: {
    alignSelf: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginTop: EventTheme.spacing.md,
    maxWidth: 420,
    padding: 4,
    width: "90%",
  },
  switchButton: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 14,
  },
  switchActive: { backgroundColor: EventTheme.colors.primary },
  switchText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  switchTextActive: { color: EventTheme.colors.surface },
  countBadge: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.danger,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 20,
    minWidth: 20,
    paddingHorizontal: 5,
  },
  countText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 9,
  },
});
