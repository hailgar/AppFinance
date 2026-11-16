export const useNetInfo = () => ({
  isConnected: true,
  isInternetReachable: true,
});
export default {
  fetch: async () => useNetInfo(),
  addEventListener: () => () => undefined,
};
