import { getRemoteDataSource, reloadBusDataset } from "@/services/busData";
import { invalidateRoutePlannerCache } from "@/services/routePlanner";
import { YBS_API_BASE } from "@/constants/api";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BusDataContextValue = {
  ready: boolean;
  dataVersion: number;
  customRouteCount: number;
  remoteLoaded: boolean;
  remoteSource: string | null;
  apiBaseUrl: string;
  refreshBusData: () => Promise<void>;
};

const BusDataContext = createContext<BusDataContextValue | null>(null);

export function BusDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [customRouteCount, setCustomRouteCount] = useState(0);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [remoteSource, setRemoteSource] = useState<string | null>(null);

  const refreshBusData = useCallback(async () => {
    const result = await reloadBusDataset();
    invalidateRoutePlannerCache();
    setCustomRouteCount(result.customCount);
    setRemoteLoaded(result.remoteLoaded);
    setRemoteSource(result.remoteSource ?? getRemoteDataSource());
    setDataVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await refreshBusData();
      } finally {
        if (active) setReady(true);
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [refreshBusData]);

  const value = useMemo(
    () => ({
      ready,
      dataVersion,
      customRouteCount,
      remoteLoaded,
      remoteSource,
      apiBaseUrl: YBS_API_BASE,
      refreshBusData,
    }),
    [ready, dataVersion, customRouteCount, remoteLoaded, remoteSource, refreshBusData]
  );

  return <BusDataContext.Provider value={value}>{children}</BusDataContext.Provider>;
}

export function useBusData() {
  const context = useContext(BusDataContext);
  if (!context) {
    throw new Error("useBusData must be used within BusDataProvider");
  }
  return context;
}
