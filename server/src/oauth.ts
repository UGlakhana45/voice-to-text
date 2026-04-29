import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface OAuthClaims {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

function pick(payload: JWTPayload): OAuthClaims {
  return {
    sub: String(payload.sub ?? ''),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified:
      typeof payload.email_verified === 'boolean'
        ? (payload.email_verified as boolean)
        : payload.email_verified === 'true' || undefined,
    name: typeof payload.name === 'string' ? (payload.name as string) : undefined,
  };
}

/**
 * Verify a Google ID token. Audience must match GOOGLE_CLIENT_ID(s) when set;
 * if no audience env is configured we still verify the signature + issuer
 * (useful for early-stage dev before client registration).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedAudiences?: string[],
): Promise<OAuthClaims> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: expectedAudiences,
  });
  if (!payload.sub) throw new Error('google_token_missing_sub');
  return pick(payload);
}

/**
 * Verify an Apple ID token (Sign in with Apple). Apple sets `aud` to the
 * Service ID / App ID. Provide via APPLE_CLIENT_ID env.
 */
export async function verifyAppleIdToken(
  idToken: string,
  expectedAudiences?: string[],
): Promise<OAuthClaims> {
  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: expectedAudiences,
  });
  if (!payload.sub) throw new Error('apple_token_missing_sub');
  return pick(payload);
}
