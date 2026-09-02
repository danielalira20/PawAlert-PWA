import { router, useLocalSearchParams } from "expo-router";

import CaseNavigationScreen from "../../screens/CaseNavigationScreen";

export default function CaseNavigationRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <CaseNavigationScreen
      reportId={reportId ?? null}
      onClose={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
    />
  );
}
