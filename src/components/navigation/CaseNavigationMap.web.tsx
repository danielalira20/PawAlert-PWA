import { lazy, Suspense } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Brand } from "../../constants/theme";
import type { CaseNavigationMapProps } from "./CaseNavigationMap.types";

const CaseNavigationLeafletMap = lazy(
  () => import("./CaseNavigationLeafletMap"),
);

export default function CaseNavigationMap({
  height = 360,
  ...props
}: CaseNavigationMapProps) {
  return (
    <View
      accessibilityLabel="Mapa de navegación del caso"
      style={[styles.container, { height }]}
    >
      <Suspense
        fallback={
          <View style={styles.loading}>
            <ActivityIndicator color={Brand.secondary} />
            <Text style={styles.loadingText}>Preparando la ruta…</Text>
          </View>
        }
      >
        <CaseNavigationLeafletMap {...props} height={height} />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 260,
    overflow: "hidden",
    backgroundColor: "#E9ECE8",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: Brand.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
});
