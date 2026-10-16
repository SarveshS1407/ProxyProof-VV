import * as Crypto from 'expo-crypto';

export interface DeviceKeyCredential {
  deviceIdentifier: string;
  publicKey: string;
  privateKey: string;
}

let storedCredential: DeviceKeyCredential | null = null;

export const mobileCrypto = {
  async getOrCreateDeviceCredential(): Promise<DeviceKeyCredential> {
    if (storedCredential) {
      return storedCredential;
    }

    // Generate hardware/app instance UUID
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    const deviceIdentifier = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Generate random cryptographic seed
    const seedBytes = await Crypto.getRandomBytesAsync(32);
    const privateKey = Array.from(seedBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Derive public key representation
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      privateKey
    );

    storedCredential = {
      deviceIdentifier: `mob-${deviceIdentifier.substring(0, 12)}`,
      publicKey: digest,
      privateKey: privateKey,
    };

    return storedCredential;
  },

  async signPayload(credential: DeviceKeyCredential, canonicalString: string): Promise<string> {
    // Generate signature over canonical check-in string using private key
    const signature = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${credential.privateKey}:${canonicalString}`
    );
    return signature;
  },
};
