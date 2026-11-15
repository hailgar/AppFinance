import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  getIdToken,
  signOut,
} from "@react-native-firebase/auth";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
export const auth = getAuth();
export const observeSession = (
  listener: Parameters<typeof onAuthStateChanged>[1],
) => onAuthStateChanged(auth, listener);
export async function login() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) throw Error("Konfigurasi Google Sign-In belum tersedia.");
  GoogleSignin.configure({ webClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) return;
  if (!result.data.idToken) throw Error("Google tidak memberikan token login.");
  await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(result.data.idToken),
  );
}
export const tokenSource = {
  token: async (force = false) => {
    if (!auth.currentUser) throw Error("Sesi tidak tersedia.");
    return getIdToken(auth.currentUser, force);
  },
};
export async function logout() {
  await signOut(auth);
  await GoogleSignin.signOut().catch(() => undefined);
}
