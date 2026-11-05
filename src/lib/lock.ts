import { Capacitor } from '@capacitor/core';

/**
 * App lock: PIN (salted SHA-256) and optional biometric via WebAuthn platform
 * authenticator. This is a local privacy gate, not data encryption.
 */

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPin(pin: string, salt?: string) {
  const s = salt ?? b64(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(s + ':' + pin));
  return { hash: b64(digest), salt: s };
}

export async function verifyPin(pin: string, hash: string, salt: string) {
  return (await hashPin(pin, salt)).hash === hash;
}

export async function biometricAvailable(): Promise<boolean> {
  // Android/iOS WebViews don't expose passkeys to apps, so the phone app uses PIN only.
  if (Capacitor.isNativePlatform()) return false;
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function registerBiometric(): Promise<string | null> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Moneta' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'moneta-user', displayName: 'Moneta' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    return cred ? b64(cred.rawId) : null;
  } catch {
    return null;
  }
}

export async function verifyBiometric(id: string): Promise<boolean> {
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(id) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!res;
  } catch {
    return false;
  }
}
