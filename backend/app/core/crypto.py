import base64
import binascii
from typing import Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ed25519, ec, utils
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import load_pem_public_key


def generate_ed25519_keypair() -> Tuple[str, str]:
    """Generates a test/client Ed25519 keypair, returning (private_key_hex, public_key_hex)."""
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    priv_bytes = private_key.private_bytes_raw()
    pub_bytes = public_key.public_bytes_raw()
    return priv_bytes.hex(), pub_bytes.hex()


def sign_payload_ed25519(private_key_hex: str, message: str) -> str:
    """Signs message using Ed25519 private key, returning hex signature."""
    priv_bytes = bytes.fromhex(private_key_hex)
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_bytes)
    sig = private_key.sign(message.encode("utf-8"))
    return sig.hex()


def verify_device_signature(public_key_str: str, message: str, signature_str: str) -> bool:
    """
    Verifies that 'signature_str' is a valid signature over 'message'
    produced by the private key corresponding to 'public_key_str'.
    Supports Ed25519 (raw hex or base64) and PEM-encoded ECDSA/Ed25519 keys.
    """
    msg_bytes = message.encode("utf-8")
    
    # 1. Try decoding hex signature
    sig_bytes = None
    try:
        sig_bytes = bytes.fromhex(signature_str.strip())
    except Exception:
        try:
            sig_bytes = base64.b64decode(signature_str.strip())
        except Exception:
            return False

    # 2. Try raw Ed25519 32-byte public key (hex or base64)
    pub_bytes = None
    try:
        pub_bytes = bytes.fromhex(public_key_str.strip())
    except Exception:
        try:
            pub_bytes = base64.b64decode(public_key_str.strip())
        except Exception:
            pass

    if pub_bytes and len(pub_bytes) == 32:
        try:
            ed_pub = ed25519.Ed25519PublicKey.from_public_bytes(pub_bytes)
            ed_pub.verify(sig_bytes, msg_bytes)
            return True
        except (InvalidSignature, ValueError):
            pass

    # 3. Try PEM-encoded Public Key (X.509 SubjectPublicKeyInfo)
    if "BEGIN PUBLIC KEY" in public_key_str:
        try:
            loaded_key = load_pem_public_key(public_key_str.encode("utf-8"))
            if isinstance(loaded_key, ed25519.Ed25519PublicKey):
                loaded_key.verify(sig_bytes, msg_bytes)
                return True
            elif isinstance(loaded_key, ec.EllipticCurvePublicKey):
                test_sig = sig_bytes
                if len(sig_bytes) == 64:
                    try:
                        r = int.from_bytes(sig_bytes[:32], byteorder="big")
                        s = int.from_bytes(sig_bytes[32:], byteorder="big")
                        test_sig = utils.encode_dss_signature(r, s)
                    except Exception:
                        test_sig = sig_bytes
                loaded_key.verify(test_sig, msg_bytes, ec.ECDSA(hashes.SHA256()))
                return True
        except Exception:
            return False

    # 4. Try raw uncompressed EC SECP256R1 public key (65 bytes)
    if pub_bytes and len(pub_bytes) == 65 and pub_bytes[0] == 4:
        try:
            ec_pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), pub_bytes)
            test_sig = sig_bytes
            if len(sig_bytes) == 64:
                try:
                    r = int.from_bytes(sig_bytes[:32], byteorder="big")
                    s = int.from_bytes(sig_bytes[32:], byteorder="big")
                    test_sig = utils.encode_dss_signature(r, s)
                except Exception:
                    test_sig = sig_bytes
            ec_pub.verify(test_sig, msg_bytes, ec.ECDSA(hashes.SHA256()))
            return True
        except Exception:
            return False

    return False


def validate_public_key(public_key_str: str) -> bool:
    """
    Validates whether 'public_key_str' is a valid cryptographic public key.
    Supported formats:
    - 32-byte Ed25519 raw public key (64 hex characters or base64)
    - X.509 SubjectPublicKeyInfo PEM string (Ed25519 or ECDSA P-256)
    - 65-byte uncompressed EC SECP256R1 point (130 hex characters)
    """
    if not public_key_str or not isinstance(public_key_str, str):
        return False
    
    clean = public_key_str.strip()
    if not clean:
        return False

    # Check 1: PEM format
    if "BEGIN PUBLIC KEY" in clean:
        try:
            key = load_pem_public_key(clean.encode("utf-8"))
            if isinstance(key, (ed25519.Ed25519PublicKey, ec.EllipticCurvePublicKey)):
                return True
        except Exception:
            return False

    # Check 2: Raw bytes (hex)
    try:
        raw_bytes = bytes.fromhex(clean)
        if len(raw_bytes) == 32:
            ed25519.Ed25519PublicKey.from_public_bytes(raw_bytes)
            return True
        elif len(raw_bytes) == 65 and raw_bytes[0] == 4:
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw_bytes)
            return True
    except Exception:
        pass

    # Check 3: Base64 raw bytes
    try:
        raw_bytes = base64.b64decode(clean)
        if len(raw_bytes) == 32:
            ed25519.Ed25519PublicKey.from_public_bytes(raw_bytes)
            return True
        elif len(raw_bytes) == 65 and raw_bytes[0] == 4:
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw_bytes)
            return True
    except Exception:
        pass

    return False

