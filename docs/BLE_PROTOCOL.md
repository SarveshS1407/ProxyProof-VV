# ProxyProof BLE Protocol Specification

## 1. Overview
ProxyProof uses Bluetooth Low Energy (BLE) to detect physical presence of students in the vicinity of an attendance session organiser. The protocol ensures that attendance is recorded automatically without manual roll calls or static QR codes, while preventing proxy check-ins through cryptographic rotating tokens, asymmetric device binding, replay rejection, and proximity RSSI checks.

---

## 2. Roles & Architecture

| Role | BLE Role | Description |
| :--- | :--- | :--- |
| **Organiser** | **Peripheral (Advertiser)** | Hosts the attendance session, broadcasts advertising packets containing the session ID and rotating token. |
| **Student** | **Central (Scanner)** | Scans for the ProxyProof service UUID in the foreground, decodes the rotating token, records RSSI, and signs a check-in payload. |
| **Backend Server** | **Verification Authority** | Authorizes sessions, generates/validates rotating tokens, verifies student device signature, validates RSSI, and records attendance. |

---

## 3. BLE Advertising Packet Specification

To comply with legacy BLE 4.0/4.2 specifications (maximum 31-byte advertising data payload), ProxyProof uses a compact, high-entropy service data structure:

### 3.1 Service UUID
* **ProxyProof Service UUID (16-bit short):** `0xFD00`
* **ProxyProof Service UUID (128-bit full):** `0000FD00-0000-1000-8000-00805F9B34FB`

### 3.2 Service Data Payload Layout (21 Bytes)

```
+---------------+---------------------+--------------------+--------------------+
| Version (1B)  | Session ID Hash(8B) | Window Index (4B)  | Rotating Token(8B) |
+---------------+---------------------+--------------------+--------------------+
```

* **Version (1 byte):** `0x01` (Protocol v1).
* **Session ID Hash (8 bytes):** Truncated SHA-256 hash of the session UUID (allows the student app to identify the specific active session).
* **Window Index (4 bytes, unsigned big-endian uint32):** `floor(current_timestamp / rotation_interval_seconds)`.
* **Rotating Token (8 bytes):** Truncated HMAC-SHA256 of `(session_secret || session_id || window_index)`.

**Total Advertising Payload Size:**
* Flags: 3 bytes (`0x02, 0x01, 0x06`)
* 16-bit Service UUID: 4 bytes (`0x03, 0x03, 0x00, 0xFD`)
* Service Data: 23 bytes (`0x16, 0x16, 0x00, 0xFD, ...21 bytes data...`)
* **Total:** 30 bytes $\le$ 31 bytes (Guaranteed compatible across all BLE chipsets).

---

## 4. Token Generation & Verification Algorithm

### 4.1 Token Derivation
When an organiser initiates a session, the backend generates an unpredictable 256-bit `session_secret`.
For each rotation window $W_i = \lfloor t / T \rfloor$ where $T$ is the rotation period (default 10 seconds):

$$\text{Token}(W_i) = \text{HMAC-SHA256}(\text{session\_secret}, \text{session\_id} \parallel W_i)[0..7]$$

Expressed as a 16-character hex string or 8 raw bytes.

### 4.2 Window Acceptance Window
To accommodate real-world network latency, student processing time, and slight clock drift between organiser and server:
* Server accepts tokens generated for:
  * Current window: $W_i$
  * Immediate prior window: $W_{i-1}$ (grace period of $T$ seconds)
  * Immediate next window: $W_{i+1}$ (allowing for minor client clock lead)
* Any token older than $W_{i-1}$ is strictly rejected as expired.

---

## 5. Student Verification & Anti-Proxy Check-In Flow

```
[Organiser Device]          [Student Device]             [ProxyProof Server]
       |                           |                              |
       |--- Broadcasts Token ---->|                              |
       |    (Session ID, Token,    |                              |
       |     Window, RSSI)         |                              |
       |                           |                              |
       |                           |-- 1. Measure RSSI            |
       |                           |-- 2. Generate Nonce & Ts     |
       |                           |-- 3. Sign Payload with       |
       |                           |      Device Private Key      |
       |                           |                              |
       |                           |------ POST /attendance ----->|
       |                           |      {session_id, token,     |
       |                           |       rssi, timestamp,       |
       |                           |       device_id, signature}  |
       |                           |                              |
       |                           |                       Verify:|
       |                           |                   1. Session |
       |                           |                   2. Token   |
       |                           |                   3. Device  |
       |                           |                   4. Sig     |
       |                           |                   5. RSSI    |
       |                           |                   6. Replay  |
       |                           |                              |
       |                           |<--- 201 Created (Confirmed) -|
       |<==== Live WebSocket Broadcast (Attendance Record) =======|
```

### 5.1 Device Signature
The student app signs the canonical check-in string:
`"{student_id}:{session_id}:{token}:{timestamp}:{nonce}:{rssi}"`
using their hardware-backed or application-managed Ed25519/ECDSA private key.
The backend verifies this signature using the student's registered, approved public key.

---

## 6. Proximity & RSSI Thresholding

1. **RSSI Threshold:** Default minimum threshold is `-85 dBm`.
2. **Signal Filtering:** The mobile application captures multiple advertising frames when possible and computes the median or exponential moving average (EMA) RSSI to eliminate transient multipath interference.
3. **Audit Recording:** Both the reported RSSI and proximity pass/fail state are permanently stored in the attendance record for inspection and anomaly detection.

---

## 7. OS & Platform Compatibility

* **Organiser Advertising:**
  * **Android:** Supported on Android 5.0+ (API 21+) with BLE peripheral mode support (`BluetoothAdapter.isMultipleAdvertisementSupported()`).
  * **iOS:** Supported in foreground via `CBPeripheralManager`. Note: iOS limits custom manufacturer data when backgrounded, so organiser sessions must be run in foreground.
  * **Web/Desktop Organisers:** When the organiser is using the web dashboard on a machine without BLE peripheral capabilities, the dashboard provides a companion mobile advertiser mode or synchronized secure QR code token display.
* **Student Scanning:**
  * **Android:** Android 6.0+ (API 23+) with `ACCESS_FINE_LOCATION` or `BLUETOOTH_SCAN` permissions.
  * **iOS:** iOS 12+ with `NSBluetoothAlwaysUsageDescription`. Foreground scanning operates continuously. Background scanning is restricted by iOS power management; students must open the app to check in.
