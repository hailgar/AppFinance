import { useSyncExternalStore } from "react";
let current = { pathname: "/", params: {} };
const stack = [],
  subscribers = new Set();
const emit = () => {
  for (const callback of subscribers) callback();
};
function normalize(route) {
  const next =
    typeof route === "string" ? { pathname: route, params: {} } : route;
  return { ...next, pathname: next.pathname.replace("/(tabs)", "") || "/" };
}
export const router = {
  push(route) {
    stack.push(current);
    current = normalize(route);
    emit();
  },
  replace(route) {
    current = normalize(route);
    emit();
  },
  back() {
    current = stack.pop() || { pathname: "/", params: {} };
    emit();
  },
};
export const usePreviewRoute = () =>
  useSyncExternalStore(
    (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    () => current,
  );
export const useLocalSearchParams = () => usePreviewRoute().params;
export const useRouter = () => router;
