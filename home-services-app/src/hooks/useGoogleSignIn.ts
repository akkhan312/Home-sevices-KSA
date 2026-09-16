import { NativeModules } from 'react-native';

// Check if the native Google Sign-In module is available (not in Expo Go)
const isGoogleSignInAvailable = !!NativeModules.RNGoogleSignin;

export function useGoogleSignIn() {
  const configure = (options: any) => {
    if (!isGoogleSignInAvailable) {
      console.warn('Google Sign-In: native module not available in Expo Go. Requires a custom build.');
      return;
    }
    try {
      // Hide require from Metro static analysis
      const moduleName = '@react-native-google-signin' + '/google-signin';
      const { GoogleSignin } = require(moduleName);
      GoogleSignin.configure(options);
    } catch (e) {
      console.warn('GoogleSignin configure error:', e);
    }
  };

  const signIn = async (): Promise<string> => {
    if (!isGoogleSignInAvailable) {
      throw new Error('Google Sign-In requires a custom development build.\nPlease use Email/Password login in Expo Go.');
    }
    // Hide require from Metro static analysis
    const moduleName = '@react-native-google-signin' + '/google-signin';
    const { GoogleSignin } = require(moduleName);
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;
    if (!idToken) throw new Error('No ID token from Google Sign-In');
    return idToken;
  };

  return { configure, signIn };
}
