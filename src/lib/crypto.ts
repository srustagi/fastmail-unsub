import { getEnv } from "@/lib/runtime";

interface EncryptedPayload {
  version: 1;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = base64ToBytes(value);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function credentialKey(): Promise<CryptoKey> {
  const encodedKey = getEnv().CREDENTIALS_KEY;
  if (!encodedKey) {
    throw new Error("CREDENTIALS_KEY is not configured.");
  }

  const rawKey = base64ToArrayBuffer(encodedKey);
  if (rawKey.byteLength !== 32) {
    throw new Error("CREDENTIALS_KEY must be exactly 32 bytes encoded as base64.");
  }

  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(
  value: string,
  context: string,
): Promise<string> {
  const key = await credentialKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(context),
    },
    key,
    new TextEncoder().encode(value),
  );

  return JSON.stringify({
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  } satisfies EncryptedPayload);
}

export async function decryptSecret(
  payload: string,
  context: string,
): Promise<string> {
  const parsed = JSON.parse(payload) as EncryptedPayload;
  if (parsed.version !== 1) throw new Error("Unknown encrypted value version.");

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToArrayBuffer(parsed.iv),
      additionalData: new TextEncoder().encode(context),
    },
    await credentialKey(),
    base64ToArrayBuffer(parsed.ciphertext),
  );

  return new TextDecoder().decode(plaintext);
}

export async function stableId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
    .slice(0, 32);
}
