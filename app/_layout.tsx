import "react-native-gesture-handler";
import { colors } from "@/constants/theme";
import { BusDataProvider } from "@/contexts/BusDataContext";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

function RootNavigator() {
  const { t } = useLocale();

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="route/[id]" options={{ title: t("detail", "routeTitle") }} />
        <Stack.Screen name="stop/[id]" options={{ title: t("detail", "stopTitle") }} />
        <Stack.Screen name="contribute" options={{ title: t("contribute", "title") }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <LocaleProvider>
      <BusDataProvider>
        <RootNavigator />
      </BusDataProvider>
    </LocaleProvider>
  );
}
