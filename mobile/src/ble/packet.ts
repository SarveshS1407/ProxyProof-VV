/**
 * ProxyProof BLE Advertisement Packet Encoder and Decoder
 * 
 * Conforms to ProxyProof BLE Specification:
 * - Service UUID: 0xFD00 (16-bit short) / 0000FD00-0000-1000-8000-00805F9B34FB
 * - Service Data Payload: 21 bytes
 *   - Byte 0: Protocol Version (0x01)
 *   - Bytes 1-8: Session Short ID (8 bytes / 16 hex chars)
 *   - Bytes 9-12: Window Index (4 bytes, uint32 big-endian)
 *   - Bytes 13-20: Rotating Token (8 bytes / 16 hex chars)
 * 
 * Total advertisement packet: Flags (3B) + UUID (4B) + Service Data (23B) = 30B <= 31B max.
 */

export const PROXYPROOF_SERVICE_UUID_16 = 'FD00';
export const PROXYPROOF_SERVICE_UUID_128 = '0000FD00-0000-1000-8000-00805F9B34FB';
export const PROTOCOL_VERSION = 0x01;
export const SERVICE_DATA_PAYLOAD_LENGTH = 21;

export interface BlePacketData {
  version: number;
  sessionShortId: string; // 16 hex characters
  windowIndex: number;
  token: string;          // 16 hex characters
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  return '';
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(0);
}

/**
 * Encodes session rotating credentials into a compliant 21-byte ProxyProof BLE Service Data packet.
 */
export function encodeBleAdvertisement(
  version: number,
  sessionShortIdHex: string,
  windowIndex: number,
  tokenHex: string
): Uint8Array {
  const packet = new Uint8Array(SERVICE_DATA_PAYLOAD_LENGTH);

  // Byte 0: Version
  packet[0] = version & 0xff;

  // Bytes 1-8: Session Short ID (16 hex chars -> 8 bytes)
  const sessionBytes = hexToBytes(sessionShortIdHex.padEnd(16, '0').substring(0, 16));
  packet.set(sessionBytes, 1);

  // Bytes 9-12: Window Index (uint32 big-endian)
  packet[9] = (windowIndex >>> 24) & 0xff;
  packet[10] = (windowIndex >>> 16) & 0xff;
  packet[11] = (windowIndex >>> 8) & 0xff;
  packet[12] = windowIndex & 0xff;

  // Bytes 13-20: Rotating Token (16 hex chars -> 8 bytes)
  const tokenBytes = hexToBytes(tokenHex.padEnd(16, '0').substring(0, 16));
  packet.set(tokenBytes, 13);

  return packet;
}

/**
 * Decodes raw bytes from a received BLE Service Data advertisement.
 * Returns null if the packet does not match ProxyProof version or length requirements.
 */
export function decodeBleAdvertisement(rawBytes: Uint8Array): BlePacketData | null {
  if (!rawBytes || rawBytes.length < SERVICE_DATA_PAYLOAD_LENGTH) {
    return null;
  }

  // Byte 0: Version check
  const version = rawBytes[0];
  if (version !== PROTOCOL_VERSION) {
    return null;
  }

  // Bytes 1-8: Session Short ID
  const sessionShortId = bytesToHex(rawBytes.subarray(1, 9));

  // Bytes 9-12: Window Index
  const windowIndex =
    ((rawBytes[9] << 24) >>> 0) |
    (rawBytes[10] << 16) |
    (rawBytes[11] << 8) |
    rawBytes[12];

  // Bytes 13-20: Rotating Token
  const token = bytesToHex(rawBytes.subarray(13, 21));

  return {
    version,
    sessionShortId,
    windowIndex,
    token,
  };
}
