// Web stub — Google Sign-In not supported on web
export function useGoogleSignIn() {
  const configure = (_options: any) => {};
  const signIn = async (): Promise<string> => {
    throw new Error('Google Sign-In is only available on Android and iOS.');
  };
  return { configure, signIn };
}
