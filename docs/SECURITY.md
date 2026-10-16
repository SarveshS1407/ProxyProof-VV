# ProxyProof Security Architecture & Anti-Proxy Analysis

## 1. Threat Model & Adversarial Objectives

In university attendance tracking, adversarial students may attempt several proxy strategies:
1. **Remote/Off-Campus Check-In:** A student attempts to check in from home or outside the classroom.
2. **Credential Sharing / Multiple Logins:** A present student logs into absent peers' accounts on their single phone.
3. **Token Relaying:** A present student captures the BLE advertisement or session token and texts/messages it to absent peers.
4. **Packet Replay:** Re-submitting previously observed attendance requests.
5. **Session Tampering:** Modifying timestamps, attendance counts, or impersonating an organiser.
6. **False Hardware Spoofing:** Randomizing device IDs or MAC addresses to bypass device registration limits.

---

## 2. Layered Defense Architecture

ProxyProof deploys defense-in-depth across the protocol, cryptography, backend validation, and device architecture:

```
[Layer 1: Ephemeral BLE Token Rotation]
  └── Valid for only ~10 seconds. Exposing a token to remote peers is ineffective
      because it expires before it can be relayed and acted upon.

[Layer 2: Server-Side Cryptographic Authority]
  └── Tokens are verified against server-held session secrets. The client never defines validity.

[Layer 3: Asymmetric Device-Bound Identity]
  └── Every student registers a cryptographic public key (Ed25519/ECDSA).
      Check-ins require a digital signature produced by the private key on that device.
      Prevents one phone from checking in multiple students.

[Layer 4: Single-Device Binding & Admin Approval]
  └── A student account is bound to exactly one active device.
      Device changes require administrative verification and approval, preventing fraudulent swaps.

[Layer 5: Replay & Nonce Tracking]
  └── Attendance records are unique per student-session pair (idempotent creation).
      Nonces and timestamps enforce freshness.

[Layer 6: RSSI Proximity Thresholding]
  └── Checks signal strength (default >= -85 dBm). Flags or rejects anomalous distance readings.

[Layer 7: Comprehensive Audit Logging & Role-Based Access Control]
  └── Every manual attendance correction, device registration, and admin approval is logged with actor ID and timestamp.
```

---

## 3. Detailed Defense Mechanisms

### 3.1 Ephemeral Rotating Tokens (Anti-Relay Layer 1)
* Attendance sessions generate tokens refreshed every 10 seconds.
* Tokens are derived from `HMAC-SHA256(session_secret, session_id || window)`.
* By the time an absent student receives a forwarded token over chat/messaging and attempts to check in, the token window has expired and is rejected by the server.

### 3.2 Device-Bound Public Key Signature (Anti-Credential Sharing)
* During student account setup, a cryptographic key pair is generated locally on the student's device.
* The public key is submitted during registration and bound to the student ID.
* For every check-in, the student app generates a signature over the payload `(student_id, session_id, token, timestamp, nonce, rssi)`.
* **Adversary consequence:** An absent student cannot simply share their password with a friend in class. The friend's phone does not hold the absent student's private key. The server verifies that the check-in was signed by the registered device key.

### 3.3 Administrative Device Change Workflow
* A student cannot freely unbind their device or register multiple devices.
* Legitimate device upgrades or repairs require submitting a `DeviceChangeRequest`.
* Only an authorized Administrator can review and approve new hardware bindings.

### 3.4 Idempotency & Replay Resistance
* The database enforces a `UNIQUE(session_id, student_id)` constraint on attendance records.
* Submitting duplicate requests does not create duplicate entries or alter timestamps.
* Tokens submitted after session closure are rejected.

---

## 4. Known Security Limitations & Residual Risks

No wireless or software-based proximity solution can guarantee 100% resistance against all theoretical attacks without specialized hardware:

1. **Active Real-Time Wormhole / Relay Attack:**
   * An adversary with specialized, ultra-low-latency radio equipment (or custom high-speed tunneled software) could capture BLE packets in the lecture hall and re-transmit them to a remote phone in under 2 seconds.
   * *Mitigation:* The short 10-second rotation window makes manual human forwarding useless. Combining with strict RSSI limits and random challenge-response exchanges substantially raises the hardware barrier.
2. **RSSI Fluctuation:**
   * Radio Frequency (RF) signals are subject to multipath interference, body shadowing, walls, and varying antenna gains across phone models.
   * *Mitigation:* RSSI is an approximate proximity indicator, not a precision ruler. We recommend a conservative threshold (-85 dBm) and multi-packet averaging.
3. **Compromised / Rooted Devices:**
   * On fully rooted devices without hardware Secure Enclave / Android Keystore isolation, a knowledgeable user could extract the private key.
   * *Mitigation:* System administrators can inspect audit logs for anomalies, and instructors maintain manual override authority on the live dashboard.
