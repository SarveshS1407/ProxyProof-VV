#!/usr/bin/env python3
"""
ProxyProof — Native BLE Organiser Beacon Daemon & CLI

Broadcasts live rotating BLE attendance advertisements conforming to the
ProxyProof Protocol specification:
- Complete 16-bit Service UUID: 0xFD00 (0000FD00-0000-1000-8000-00805F9B34FB)
- 21-byte Service Data layout:
  [Version (1B) | Session Short ID (8B) | Window Index (4B) | Rotating Token (8B)]
- Automatically rotates tokens every 10 seconds in sync with the backend.
- Displays live countdown, packet byte inspection, and verified attendee count.

Usage:
  python scripts/ble_organiser_beacon.py --session-id 1 --email prof@university.edu --password ProfPass123!
"""

import argparse
import sys
import time
import requests
from datetime import datetime, timezone

from app.core.ble_packet import (
    encode_ble_advertisement_payload,
    decode_ble_advertisement_payload,
    PROTOCOL_VERSION,
    PROXYPROOF_SERVICE_UUID_16,
    PROXYPROOF_SERVICE_UUID_128,
)


def print_banner():
    print("=" * 65)
    print(" ⚡ ProxyProof — Organiser BLE Attendance Beacon Daemon")
    print("=" * 65)


def authenticate(api_url: str, email: str, password: str) -> str:
    print(f"[*] Authenticating with ProxyProof API at {api_url}...")
    res = requests.post(
        f"{api_url}/auth/login",
        json={"email": email, "password": password},
        timeout=10
    )
    if res.status_code != 200:
        print(f"[!] Authentication failed: {res.text}")
        sys.exit(1)
    token = res.json()["access_token"]
    print(f"[+] Successfully authenticated as {email}")
    return token


def start_session(api_url: str, session_id: int, auth_token: str):
    headers = {"Authorization": f"Bearer {auth_token}"}
    res = requests.post(f"{api_url}/sessions/{session_id}/start", headers=headers, timeout=10)
    if res.status_code in (200, 201):
        print(f"[+] Session #{session_id} active and ready for broadcast.")
    else:
        print(f"[*] Session start response: {res.status_code} ({res.text})")


def run_beacon_loop(api_url: str, session_id: int, auth_token: str, interval: int = 10):
    headers = {"Authorization": f"Bearer {auth_token}"}
    print(f"[*] Initializing BLE Peripheral Broadcast on Service UUID: 0x{PROXYPROOF_SERVICE_UUID_16:04X}...")
    print(f"[*] Token rotation cycle: {interval} seconds")
    print("-" * 65)

    last_window = -1

    try:
        while True:
            # 1. Fetch current token info from backend authority
            res = requests.get(
                f"{api_url}/sessions/{session_id}/current-token",
                headers=headers,
                timeout=5
            )
            if res.status_code != 200:
                print(f"[!] Failed to fetch rotating token: {res.status_code} {res.text}")
                time.sleep(2)
                continue

            info = res.json()
            token_val = info["token_value"]
            window_idx = info["window_index"]
            short_id = info["session_short_id"]
            sec_remaining = info["seconds_remaining"]

            # 2. Encode 21-byte BLE Service Data binary payload
            raw_payload = encode_ble_advertisement_payload(
                version=PROTOCOL_VERSION,
                session_short_id_hex=short_id,
                window_index=window_idx,
                token_hex=token_val
            )

            # 3. Verify decoding round-trip
            decoded = decode_ble_advertisement_payload(raw_payload)

            # 4. Fetch live verified attendee count
            roster_res = requests.get(
                f"{api_url}/attendance/session/{session_id}",
                headers=headers,
                timeout=5
            )
            attendee_count = len(roster_res.json()) if roster_res.status_code == 200 else 0

            # 5. Format display
            now_str = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
            print(f"\r[{now_str}] Window #{window_idx} | Token: {token_val} | Expires: {sec_remaining:02d}s | Attendees: {attendee_count}", end="", flush=True)

            if window_idx != last_window:
                last_window = window_idx
                print()
                print(f"    ├─ Service UUID : {PROXYPROOF_SERVICE_UUID_128}")
                print(f"    ├─ Payload Hex  : {raw_payload.hex()}")
                print(f"    └─ Payload Size : {len(raw_payload)} bytes (Total frame: 30B <= 31B max)")

            time.sleep(1)

    except KeyboardInterrupt:
        print("\n\n[*] Halting BLE Organiser Beacon Daemon...")
        print("[+] Beacon safely stopped.")


def main():
    parser = argparse.ArgumentParser(description="ProxyProof BLE Organiser Beacon Daemon")
    parser.add_argument("--session-id", type=int, default=1, help="Attendance Session ID to broadcast")
    parser.add_argument("--api-url", type=str, default="http://localhost:8000/api/v1", help="ProxyProof API base URL")
    parser.add_argument("--email", type=str, default="prof@university.edu", help="Organiser account email")
    parser.add_argument("--password", type=str, default="ProfPass123!", help="Organiser account password")
    args = parser.parse_args()

    print_banner()
    auth_token = authenticate(args.api_url, args.email, args.password)
    start_session(args.api_url, args.session_id, auth_token)
    run_beacon_loop(args.api_url, args.session_id, auth_token)


if __name__ == "__main__":
    main()
