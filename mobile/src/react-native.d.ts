declare module 'react-native' {
  export const Platform: {
    OS: 'ios' | 'android' | 'windows' | 'macos' | 'web';
    Version: number | string;
  };
  export const PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: string;
      BLUETOOTH_CONNECT: string;
      BLUETOOTH_ADVERTISE: string;
      ACCESS_FINE_LOCATION: string;
      BLUETOOTH: string;
      BLUETOOTH_ADMIN: string;
    };
    RESULTS: {
      GRANTED: string;
      DENIED: string;
      NEVER_ASK_AGAIN: string;
    };
    request(permission: string, rationale?: any): Promise<string>;
    requestMultiple(permissions: string[]): Promise<{ [key: string]: string }>;
  };
  export const StyleSheet: {
    create(styles: any): any;
  };
  export const Text: any;
  export const View: any;
  export const TextInput: any;
  export const TouchableOpacity: any;
  export const ScrollView: any;
  export const SafeAreaView: any;
  export const StatusBar: any;
  export const ActivityIndicator: any;
  export const Alert: {
    alert(title: string, message?: string, buttons?: any[]): void;
  };
}

declare module 'react-native-ble-plx' {
  export class BleManager {
    constructor();
    onStateChange(listener: (state: string) => void, emitCurrentState?: boolean): any;
    startDeviceScan(
      filteredUUIDs: string[] | null,
      options: any | null,
      listener: (error: any, scannedDevice: any) => void
    ): void;
    stopDeviceScan(): void;
  }
}

declare var Buffer: any;
declare var require: any;
declare var process: any;
