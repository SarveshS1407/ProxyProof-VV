from app.core.crypto import (
    generate_ed25519_keypair, sign_payload_ed25519, verify_device_signature
)


def test_ed25519_keypair_generation_and_valid_signature():
    priv, pub = generate_ed25519_keypair()
    message = "1:42:token123:1729000000:nonce456:-75"
    sig = sign_payload_ed25519(priv, message)

    assert verify_device_signature(pub, message, sig) is True


def test_tampered_payload_signature_rejection():
    priv, pub = generate_ed25519_keypair()
    message = "1:42:token123:1729000000:nonce456:-75"
    sig = sign_payload_ed25519(priv, message)

    # Tamper with the student ID or RSSI
    tampered_message = "2:42:token123:1729000000:nonce456:-75"
    assert verify_device_signature(pub, tampered_message, sig) is False


def test_wrong_key_signature_rejection():
    priv1, pub1 = generate_ed25519_keypair()
    _, pub2 = generate_ed25519_keypair()
    message = "test canonical payload"
    sig = sign_payload_ed25519(priv1, message)

    # Verify against wrong public key
    assert verify_device_signature(pub2, message, sig) is False


def test_invalid_signature_hex():
    _, pub = generate_ed25519_keypair()
    assert verify_device_signature(pub, "hello", "not_a_valid_hex_signature") is False


def test_ecdsa_p256_spki_and_raw64_signature_verification():
    from cryptography.hazmat.primitives.asymmetric import ec, utils
    from cryptography.hazmat.primitives import hashes, serialization

    # Generate P-256 keypair
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    pub_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")

    message = "1:10:token999:1729000000:nonceabc:-65"
    der_sig = private_key.sign(message.encode("utf-8"), ec.ECDSA(hashes.SHA256()))

    # Test 1: Standard DER hex format
    assert verify_device_signature(pub_pem, message, der_sig.hex()) is True

    # Test 2: WebCrypto 64-byte IEEE P1363 raw r||s format
    r, s = utils.decode_dss_signature(der_sig)
    raw64_bytes = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    assert verify_device_signature(pub_pem, message, raw64_bytes.hex()) is True

    # Test 3: Tampered message rejected
    assert verify_device_signature(pub_pem, message + "_tampered", raw64_bytes.hex()) is False
