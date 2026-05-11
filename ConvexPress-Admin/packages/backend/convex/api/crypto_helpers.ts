/**
 * API System - Crypto Helpers
 *
 * Shared cryptographic utility functions used by mutations.ts and internals.ts.
 * Centralizes SHA-256 hashing, AES-256-GCM encryption/decryption, and
 * HMAC-SHA256 signature computation to eliminate duplication.
 */

/**
 * Generate a random hex string of the specified byte length.
 * Uses crypto.getRandomValues which is available in the Convex runtime.
 */
export function generateRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute SHA-256 hash of a string, returning hex digest.
 */
export async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns the encrypted value as "iv:authTag:ciphertext" (all hex-encoded).
 *
 * @param plaintext - The string to encrypt
 * @param encryptionKeyHex - The 32-byte hex-encoded encryption key
 * @returns Encrypted string in format "iv:authTag:ciphertext"
 */
export async function encryptSecret(
  plaintext: string,
  encryptionKeyHex: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  // Generate random IV (12 bytes for AES-GCM)
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  // Import the encryption key
  const keyBytes = new Uint8Array(
    encryptionKeyHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintextBytes,
  );

  // AES-GCM appends the auth tag to the ciphertext
  // The last 16 bytes are the auth tag
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, encryptedArray.length - 16);
  const authTag = encryptedArray.slice(encryptedArray.length - 16);

  // Encode as hex strings
  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const authTagHex = Array.from(authTag)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const ciphertextHex = Array.from(ciphertext)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${ivHex}:${authTagHex}:${ciphertextHex}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Input format: "iv:authTag:ciphertext" (all hex-encoded).
 *
 * @param encryptedValue - The encrypted string in format "iv:authTag:ciphertext"
 * @param encryptionKeyHex - The 32-byte hex-encoded encryption key
 * @returns The decrypted plaintext string
 */
export async function decryptSecret(
  encryptedValue: string,
  encryptionKeyHex: string,
): Promise<string> {
  const parts = encryptedValue.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;

  // Decode hex to Uint8Array
  const iv = new Uint8Array(
    ivHex!.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const authTag = new Uint8Array(
    authTagHex!.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const ciphertext = new Uint8Array(
    ciphertextHex!.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  // Import the encryption key
  const keyBytes = new Uint8Array(
    encryptionKeyHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // AES-GCM expects ciphertext + authTag concatenated
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    combined,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Compute HMAC-SHA256 signature of a message using a secret key.
 * Returns "sha256=<hex digest>".
 */
export async function computeHmacSignature(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `sha256=${hex}`;
}
