import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";

export function EventValidationSummary({ issues }: { issues: string[] }) {
  if (!issues.length) return null;

  return (
    <View accessibilityRole="alert" style={styles.container}>
      <Ionicons
        name="alert-circle-outline"
        size={21}
        color={EventTheme.colors.primary}
      />
      <View style={styles.copy}>
        <Text style={styles.title}>Pendiente para publicar</Text>
        <Text style={styles.description}>
          Puedes guardar el borrador ahora. Antes de publicarlo revisa:
        </Text>
        {issues.map((issue) => (
          <View key={issue} style={styles.issueRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.issue}>{issue}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    backgroundColor: "#FFF5EA",
    borderColor: "#F4D7BA",
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  copy: { flex: 1 },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  description: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 7,
    marginTop: 2,
  },
  issueRow: { alignItems: "flex-start", flexDirection: "row", gap: 6 },
  bullet: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
    lineHeight: 18,
  },
  issue: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
    lineHeight: 18,
  },
});
