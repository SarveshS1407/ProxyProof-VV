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
