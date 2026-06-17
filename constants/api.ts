/** Base URL for ybsbusroute API (no trailing slash). */
export const YBS_API_BASE =
  process.env.EXPO_PUBLIC_YBS_API_BASE ??
  "https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main";

export function isStaticDataHost(baseUrl: string): boolean {
  return baseUrl.includes("raw.githubusercontent.com");
}
