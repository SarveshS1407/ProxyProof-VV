export interface BLEAdvertisement {
  serviceUUID: string;
  sessionId: number;
  token: string;
  rssi: number;
  windowIndex: number;
  timestamp: number;
}

export const PROXYPROOF_SERVICE_UUID = '0000FD00-0000-1000-8000-00805F9B34FB';

export const bleService = {
  isScanning: false,

  async requestPermissions(): Promise<boolean> {
    // In React Native development builds, requests BLUETOOTH_SCAN and ACCESS_FINE_LOCATION
    return true;
  },

  async scanForAttendanceBeacon(
    activeSessionId?: number,
    onBeaconDetected?: (beacon: BLEAdvertisement) => void
  ): Promise<BLEAdvertisement | null> {
    this.isScanning = true;

    // Simulate or read BLE advertisement frame
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Simulated beacon reading with authentic RSSI variance (-65 to -75 dBm)
    const simulatedRssi = -68 - Math.floor(Math.random() * 8);
    const beacon: BLEAdvertisement = {
      serviceUUID: PROXYPROOF_SERVICE_UUID,
      sessionId: activeSessionId || 1,
      token: 'simulated_ble_token',
      rssi: simulatedRssi,
      windowIndex: Math.floor(Date.now() / 10000),
      timestamp: Math.floor(Date.now() / 1000),
    };

    if (onBeaconDetected) {
      onBeaconDetected(beacon);
    }

    this.isScanning = false;
    return beacon;
  },

  stopScan() {
    this.isScanning = false;
  },
};
