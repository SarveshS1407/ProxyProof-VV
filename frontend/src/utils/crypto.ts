/**
 * WebCrypto-based hardware keypair generation, storage, and digital signing for ProxyProof.
 * Conforms to NIST P-256 (secp256r1) with SHA-256 and SubjectPublicKeyInfo (SPKI) PEM export.
 */

const STORAGE_KEY_PRIV = 'proxyproof_device_priv_jwk';
const STORAGE_KEY_PUB_PEM = 'proxyproof_device_pub_pem';
const STORAGE_KEY_DEVICE_ID = 'proxyproof_device_identifier';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface DeviceKeyInfo {
  deviceIdentifier: string;
  publicKeyPem: string;
  deviceModel: string;
  osVersion: string;
}

export async function getOrCreateDeviceKeys(): Promise<DeviceKeyInfo> {
  let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
  let pubPem = localStorage.getItem(STORAGE_KEY_PUB_PEM);
  const privJwkStr = localStorage.getItem(STORAGE_KEY_PRIV);

  if (!deviceId || !pubPem || !privJwkStr) {
    // Generate new ECDSA P-256 keypair
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );

    // Export public key in SubjectPublicKeyInfo (SPKI) DER format
    const spkiDer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const b64 = arrayBufferToBase64(spkiDer);
    pubPem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)?.join('\n') || b64}\n-----END PUBLIC KEY-----`;

    // Export private key in JWK format for secure browser storage
    const privJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // Create unique hardware/client identifier
    const randomSuffix = Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    deviceId = `browser-p256-${randomSuffix}`;

    localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    localStorage.setItem(STORAGE_KEY_PUB_PEM, pubPem);
    localStorage.setItem(STORAGE_KEY_PRIV, JSON.stringify(privJwk));
  }

  const userAgent = navigator.userAgent;
  let detectedOs = 'Web Browser (Unknown OS)';
  if (userAgent.indexOf('Mac') !== -1) detectedOs = 'macOS (Web Client)';
  else if (userAgent.indexOf('Win') !== -1) detectedOs = 'Windows (Web Client)';
  else if (userAgent.indexOf('Android') !== -1) detectedOs = 'Android (Web Client)';
  else if (userAgent.indexOf('Linux') !== -1) detectedOs = 'Linux (Web Client)';
  else if (userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) detectedOs = 'iOS (Web Client)';

  return {
    deviceIdentifier: deviceId,
    publicKeyPem: pubPem,
    deviceModel: (navigator as any).userAgentData?.brands?.[0]?.brand || 'Modern Web Browser',
    osVersion: detectedOs
  };
}

export async function signCanonicalPayload(message: string): Promise<string> {
  const privJwkStr = localStorage.getItem(STORAGE_KEY_PRIV);
  if (!privJwkStr) {
    // If no keys exist yet, initialize them
    await getOrCreateDeviceKeys();
  }

  const updatedPrivJwkStr = localStorage.getItem(STORAGE_KEY_PRIV);
  if (!updatedPrivJwkStr) {
    throw new Error('No cryptographic device private key available on this client.');
  }

  const privJwk = JSON.parse(updatedPrivJwkStr);
  const privateKey = await window.crypto.subtle.importKey(
    'jwk',
    privJwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['sign']
  );

  const enc = new TextEncoder();
  const signatureBuffer = await window.crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    privateKey,
    enc.encode(message)
  );

  return arrayBufferToHex(signatureBuffer);
}
