import struct
from typing import Optional, Dict, Any

PROXYPROOF_SERVICE_UUID_16 = 0xFD00
PROXYPROOF_SERVICE_UUID_128 = "0000FD00-0000-1000-8000-00805F9B34FB"
PROTOCOL_VERSION = 0x01
SERVICE_DATA_PAYLOAD_LENGTH = 21


def encode_ble_advertisement_payload(
    version: int,
    session_short_id_hex: str,
    window_index: int,
    token_hex: str
) -> bytes:
    """
    Encodes session rotating credentials into a 21-byte ProxyProof BLE Service Data packet:
    - Byte 0: Version (1 byte)
    - Bytes 1-8: Session Short ID (8 bytes)
    - Bytes 9-12: Window Index (4 bytes, uint32 big-endian)
    - Bytes 13-20: Rotating Token (8 bytes)
    """
    session_bytes = bytes.fromhex(session_short_id_hex.ljust(16, "0")[:16])
    token_bytes = bytes.fromhex(token_hex.ljust(16, "0")[:16])
    return struct.pack(">B8sI8s", version & 0xFF, session_bytes, window_index, token_bytes)


def decode_ble_advertisement_payload(payload: bytes) -> Optional[Dict[str, Any]]:
    """
    Decodes a 21-byte ProxyProof BLE Service Data packet into its constituent fields.
    Returns None if payload is too short or version does not match.
    """
    if not payload or len(payload) < SERVICE_DATA_PAYLOAD_LENGTH:
        return None

    version, session_bytes, window_index, token_bytes = struct.unpack(">B8sI8s", payload[:SERVICE_DATA_PAYLOAD_LENGTH])
    if version != PROTOCOL_VERSION:
        return None

    return {
        "version": version,
        "session_short_id": session_bytes.hex(),
        "window_index": window_index,
        "token": token_bytes.hex()
    }
