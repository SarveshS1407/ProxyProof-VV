import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, StatusBar, ActivityIndicator, Alert
} from 'react-native';
import { mobileApi, setAuthToken } from './src/services/api';
import { mobileCrypto, DeviceKeyCredential } from './src/services/crypto';
import { bleService, BLEAdvertisement, BleAdapterState } from './src/services/ble';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentScreen, setCurrentScreen] = useState<'LOGIN' | 'STUDENT_HOME' | 'ORGANISER'>('LOGIN');

  // Login Form
  const [email, setEmail] = useState('student@university.edu');
  const [password, setPassword] = useState('StudentPass123!');
  const [loading, setLoading] = useState(false);

  // Student State
  const [device, setDevice] = useState<any>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('');
  const [detectedBeacon, setDetectedBeacon] = useState<BLEAdvertisement | null>(null);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);

  // Organiser State
  const [organiserSessions, setOrganiserSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [currentToken, setCurrentToken] = useState<string>('');
  const [tokenWindow, setTokenWindow] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(10);
  const [isAdvertising, setIsAdvertising] = useState<boolean>(false);
  const [roster, setRoster] = useState<any[]>([]);

  // 1. Authentication
  const handleLogin = async (loginEmail?: string, loginPass?: string) => {
    setLoading(true);
    try {
      const e = loginEmail || email;
      const p = loginPass || password;
      const data = await mobileApi.login(e, p);
      setCurrentUser(data.user);

      if (data.user.role === 'organiser') {
        setCurrentScreen('ORGANISER');
        loadOrganiserData();
      } else {
        setCurrentScreen('STUDENT_HOME');
        loadStudentData();
      }
    } catch (err: any) {
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    bleService.stopScan();
    bleService.stopAdvertising();
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentScreen('LOGIN');
    setCheckInSuccess(null);
    setDetectedBeacon(null);
    setIsAdvertising(false);
  };

  // 2. Student Workflow
  const loadStudentData = async () => {
    try {
      // Check/request permissions
      const perm = await bleService.requestPermissions();
      setPermissionGranted(perm.granted);

      // Check device binding
      const devStatus = await mobileApi.getDeviceStatus();
      if (devStatus && devStatus.length > 0) {
        setDevice(devStatus[0]);
      } else {
        const cred = await mobileCrypto.getOrCreateDeviceCredential();
        const registered = await mobileApi.registerDevice({
          device_identifier: cred.deviceIdentifier,
          public_key: cred.publicKey,
          device_model: cred.deviceModel,
          os_version: cred.osVersion,
        });
        setDevice(registered);
      }

      const sessions = await mobileApi.getActiveSessions();
      setActiveSessions(sessions);

      const rep = await mobileApi.getStudentPercentages();
      setReport(rep);
    } catch (e: any) {
      console.warn('Error loading student data:', e);
    }
  };

  const handleScanAndCheckIn = async (session: any) => {
    setScanning(true);
    setCheckInSuccess(null);
    setDetectedBeacon(null);
    setScanStatusMessage('Initializing Bluetooth scanner...');

    try {
      // 1. Genuine BLE Scan for attendance beacon (Service UUID 0xFD00)
      const beacon = await bleService.scanForAttendanceBeacon({
        activeSessionId: session.id,
        minRssi: session.min_rssi || -85,
        onStatusChange: (status) => setScanStatusMessage(status),
        onBeaconDetected: (b) => setDetectedBeacon(b),
      });

      // 2. Extract rotating token directly from observed BLE radio packet
      const token = beacon.token;
      const rssi = beacon.rssi;
      const nowTs = Math.floor(Date.now() / 1000);
      const nonce = `mob-${Math.random().toString(36).substring(2, 10)}`;

      setScanStatusMessage('Beacon verified! Generating digital device signature...');

      // 3. Cryptographic proof-of-possession signature
      const cred = await mobileCrypto.getOrCreateDeviceCredential();
      const canonicalString = `${currentUser.id}:${session.id}:${token}:${nowTs}:${nonce}:${rssi}`;
      const signature = await mobileCrypto.signPayload(cred, canonicalString);

      setScanStatusMessage('Submitting attendance claim to server...');

      // 4. Server submission and verification
      const res = await mobileApi.submitAttendance({
        session_id: session.id,
        token: token,
        rssi: rssi,
        timestamp: nowTs,
        nonce: nonce,
        device_identifier: device?.device_identifier || cred.deviceIdentifier,
        signature: signature,
      });

      setCheckInSuccess(`Confirmed! Status: ${res.attendance_status} for ${session.title}`);
      Alert.alert('Attendance Confirmed!', `Successfully recorded for ${session.course_code}: ${session.title}`);
      loadStudentData();
    } catch (err: any) {
      Alert.alert('Check-In Rejected', err.message);
      setScanStatusMessage(`Verification failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  // 3. Organiser Workflow
  const loadOrganiserData = async () => {
    try {
      const sessions = await mobileApi.getActiveSessions();
      setOrganiserSessions(sessions);
      if (sessions.length > 0) {
        selectOrganiserSession(sessions[0]);
      }
    } catch (e: any) {
      console.warn('Error loading organiser data:', e);
    }
  };

  const selectOrganiserSession = async (session: any) => {
    setActiveSession(session);
    try {
      if (session.is_active && !session.is_closed) {
        const tokenInfo = await mobileApi.getCurrentToken(session.id);
        setCurrentToken(tokenInfo.token_value);
        setTokenWindow(tokenInfo.window_index);
        setSecondsRemaining(tokenInfo.seconds_remaining);
      }
      // Load roster
      const recs = await mobileApi.getSessionAttendance(session.id);
      setRoster(recs);
    } catch (e: any) {
      console.warn('Error selecting session:', e);
    }
  };

  const handleStartOrganiserSession = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      await mobileApi.startSession(activeSession.id);
      const tokenInfo = await mobileApi.getCurrentToken(activeSession.id);
      setCurrentToken(tokenInfo.token_value);
      setTokenWindow(tokenInfo.window_index);
      setSecondsRemaining(tokenInfo.seconds_remaining);

      // Start BLE Peripheral Advertising
      bleService.startAdvertising({
        sessionId: activeSession.id,
        sessionShortId: tokenInfo.session_short_id,
        initialToken: tokenInfo.token_value,
        windowIndex: tokenInfo.window_index,
        onTokenRotated: (newToken, newWindow) => {
          setTokenWindow(newWindow);
          setSecondsRemaining(10);
        },
      });
      setIsAdvertising(true);
      Alert.alert('Session Started', 'BLE attendance beacon is now broadcasting on Service UUID 0xFD00.');
      loadOrganiserData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopOrganiserSession = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      bleService.stopAdvertising();
      setIsAdvertising(false);
      await mobileApi.stopSession(activeSession.id);
      Alert.alert('Session Closed', 'Attendance session stopped and BLE advertising terminated.');
      loadOrganiserData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Timer effect for token countdown
  useEffect(() => {
    if (!isAdvertising) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Refresh token from server
          if (activeSession) {
            mobileApi.getCurrentToken(activeSession.id).then((info) => {
              setCurrentToken(info.token_value);
              setTokenWindow(info.window_index);
            }).catch(() => {});
          }
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isAdvertising, activeSession]);

  // SCREEN 1: LOGIN
  if (currentScreen === 'LOGIN') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.loginContent}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>📡</Text>
          </View>
          <Text style={styles.title}>ProxyProof</Text>
          <Text style={styles.subtitle}>Mobile Bluetooth Low Energy Attendance</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => handleLogin()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.demoRow}>
              <TouchableOpacity
                style={styles.demoButton}
                onPress={() => handleLogin('student@university.edu', 'StudentPass123!')}
              >
                <Text style={styles.demoButtonText}>Alice (Student)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.demoButton}
                onPress={() => handleLogin('prof@university.edu', 'ProfPass123!')}
              >
                <Text style={styles.demoButtonText}>Prof. Turing (Organiser)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // SCREEN 2: ORGANISER BLE CONTROLS
  if (currentScreen === 'ORGANISER') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Instructor Portal</Text>
            <Text style={styles.headerSubtitle}>{currentUser?.full_name} ({currentUser?.email})</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.mainScroll}>
          {/* Active Session & BLE Broadcast Card */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardHeader}>BLE Attendance Broadcast</Text>
              <View style={isAdvertising ? styles.statusPillGreen : styles.statusPillBlue}>
                <Text style={isAdvertising ? styles.statusPillGreenText : styles.statusPillBlueText}>
                  {isAdvertising ? 'ADVERTISING' : 'INACTIVE'}
                </Text>
              </View>
            </View>

            {activeSession ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.sessionTitle}>{activeSession.title}</Text>
                <Text style={styles.sessionCourse}>
                  {activeSession.course_code}: {activeSession.course_title}
                </Text>

                {isAdvertising && (
                  <View style={styles.broadcastBox}>
                    <Text style={styles.broadcastLabel}>Rotating Token (Window #{tokenWindow}):</Text>
                    <Text style={styles.tokenDisplay}>{currentToken || '••••••••'}</Text>
                    <Text style={styles.metaText}>
                      Rotation: Next token in {secondsRemaining}s | Protocol: BLE 4.2 / Service 0xFD00
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  {!isAdvertising ? (
                    <TouchableOpacity
                      style={[styles.buttonPrimary, { flex: 1, backgroundColor: '#16a34a' }]}
                      onPress={handleStartOrganiserSession}
                      disabled={loading}
                    >
                      <Text style={styles.buttonPrimaryText}>▶ Start BLE Broadcast</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.buttonPrimary, { flex: 1, backgroundColor: '#dc2626' }]}
                      onPress={handleStopOrganiserSession}
                      disabled={loading}
                    >
                      <Text style={styles.buttonPrimaryText}>■ Stop Broadcast & Close</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <Text style={styles.emptyText}>No attendance sessions configured.</Text>
            )}
          </View>

          {/* Real-Time Roster */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardHeader}>Live Attendee Roster</Text>
              <Text style={styles.metaText}>{roster.length} Verified</Text>
            </View>

            {roster.length === 0 ? (
              <Text style={styles.emptyText}>No check-ins recorded yet for this session.</Text>
            ) : (
              roster.map((r) => (
                <View key={r.id} style={styles.rosterRow}>
                  <View>
                    <Text style={styles.studentName}>{r.student_name}</Text>
                    <Text style={styles.studentMeta}>
                      ID: {r.student_id_number} | RSSI: {r.rssi} dBm
                    </Text>
                  </View>
                  <View style={styles.statusPillGreen}>
                    <Text style={styles.statusPillGreenText}>{r.status}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // SCREEN 3: STUDENT HOME & BLE SCANNER
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{currentUser?.full_name}</Text>
          <Text style={styles.headerSubtitle}>
            {currentUser?.student_profile?.student_id_number || currentUser?.email}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.mainScroll}>
        {/* Device Status & Permissions Card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardHeader}>Hardware Device Binding</Text>
            <View style={device?.status === 'APPROVED' ? styles.statusPillGreen : styles.statusPillBlue}>
              <Text style={device?.status === 'APPROVED' ? styles.statusPillGreenText : styles.statusPillBlueText}>
                {device?.status || 'VERIFYING'}
              </Text>
            </View>
          </View>
          <Text style={styles.metaText}>
            Identifier: {device?.device_identifier || 'Auto-Provisioned'}
          </Text>
          <Text style={styles.metaText}>
            Bluetooth Adapter: {bleService.getAdapterState()}
          </Text>

          {!permissionGranted && (
            <TouchableOpacity
              style={[styles.buttonPrimary, { backgroundColor: '#ea580c', marginTop: 10 }]}
              onPress={loadStudentData}
            >
              <Text style={styles.buttonPrimaryText}>Grant Bluetooth Permissions</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Nearby BLE Attendance Sessions */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Classroom BLE Sessions</Text>
          {activeSessions.length === 0 ? (
            <Text style={styles.emptyText}>
              No active attendance sessions detected in your classroom range.
            </Text>
          ) : (
            activeSessions.map((session) => {
              const isCheckedIn = report?.history?.some((h: any) => h.session_id === session.id);

              return (
                <View key={session.id} style={styles.sessionItem}>
                  <View style={styles.rowBetween}>
                    <View>
                      <Text style={styles.sessionTitle}>{session.title}</Text>
                      <Text style={styles.sessionCourse}>
                        {session.course_code}: {session.course_title}
                      </Text>
                    </View>
                    <View style={isCheckedIn ? styles.statusPillGreen : styles.statusPillBlue}>
                      <Text style={isCheckedIn ? styles.statusPillGreenText : styles.statusPillBlueText}>
                        {isCheckedIn ? 'ATTENDED' : 'ACTIVE'}
                      </Text>
                    </View>
                  </View>

                  {/* Beacon Discovery Feedback */}
                  {detectedBeacon && detectedBeacon.sessionId === session.id && (
                    <View style={styles.beaconCard}>
                      <Text style={styles.beaconTitle}>📡 BLE Beacon Detected</Text>
                      <Text style={styles.beaconText}>
                        Signal: {detectedBeacon.rssi} dBm | Token Window: #{detectedBeacon.windowIndex}
                      </Text>
                    </View>
                  )}

                  {/* Scanning Status */}
                  {scanning && (
                    <View style={styles.scanBox}>
                      <ActivityIndicator size="small" color="#4f46e5" />
                      <Text style={styles.scanStatusText}>{scanStatusMessage}</Text>
                    </View>
                  )}

                  {/* Success Banner */}
                  {checkInSuccess && (
                    <View style={styles.successBanner}>
                      <Text style={styles.successBannerText}>{checkInSuccess}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.checkInButton,
                      isCheckedIn ? { backgroundColor: '#94a3b8' } : {}
                    ]}
                    onPress={() => handleScanAndCheckIn(session)}
                    disabled={scanning || isCheckedIn}
                  >
                    <Text style={styles.checkInButtonText}>
                      {isCheckedIn ? '✓ Attendance Already Recorded' : '📡 Scan & Verify Attendance'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* Attendance Percentage Summary */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Course Standing</Text>
          {report?.course_percentages?.map((cp: any) => (
            <View key={cp.course_id} style={styles.coursePercentRow}>
              <View>
                <Text style={styles.courseName}>{cp.course_code}: {cp.course_title}</Text>
                <Text style={styles.courseMeta}>
                  {cp.attended_sessions} of {cp.total_sessions} sessions attended
                </Text>
              </View>
              <Text
                style={[
                  styles.percentValue,
                  { color: cp.attendance_percentage >= 75 ? '#16a34a' : '#dc2626' }
                ]}
              >
                {cp.attendance_percentage}%
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loginContent: { padding: 24, justifyContent: 'center', minHeight: '100%' },
  logoBadge: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: '#4f46e5',
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 12
  },
  logoBadgeText: { fontSize: 26 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  card: {
    backgroundColor: '#ffffff', borderRadius: 14, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0'
  },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12,
    fontSize: 14, marginBottom: 14, backgroundColor: '#f8fafc'
  },
  buttonPrimary: {
    backgroundColor: '#4f46e5', borderRadius: 8, padding: 14,
    alignItems: 'center', marginTop: 4
  },
  buttonPrimaryText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  demoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  demoButton: {
    flex: 1, padding: 10, borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, alignItems: 'center', marginHorizontal: 4
  },
  demoButtonText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0'
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 12, color: '#64748b' },
  logoutButton: { padding: 8 },
  logoutButtonText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  mainScroll: { padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeader: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  statusPillGreen: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusPillGreenText: { color: '#15803d', fontWeight: '700', fontSize: 11 },
  statusPillBlue: { backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusPillBlueText: { color: '#0369a1', fontWeight: '700', fontSize: 11 },
  metaText: { fontSize: 12, color: '#64748b', marginTop: 4 },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 14 },
  sessionItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  sessionCourse: { fontSize: 12, color: '#64748b', marginTop: 2 },
  checkInButton: {
    backgroundColor: '#10b981', borderRadius: 8, padding: 12,
    alignItems: 'center', marginTop: 10
  },
  checkInButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  scanBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, marginTop: 8
  },
  scanStatusText: { fontSize: 12, color: '#475569', flex: 1 },
  beaconCard: {
    backgroundColor: '#eff6ff', padding: 10, borderRadius: 8,
    marginTop: 8, borderWidth: 1, borderColor: '#bfdbfe'
  },
  beaconTitle: { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },
  beaconText: { fontSize: 11, color: '#3b82f6', marginTop: 2 },
  successBanner: {
    backgroundColor: '#dcfce7', padding: 8, borderRadius: 6,
    marginTop: 8, borderWidth: 1, borderColor: '#86efac'
  },
  successBannerText: { color: '#15803d', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  broadcastBox: {
    backgroundColor: '#f8fafc', padding: 14, borderRadius: 8,
    marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0'
  },
  broadcastLabel: { fontSize: 12, fontWeight: '600', color: '#475569' },
  tokenDisplay: {
    fontSize: 24, fontWeight: '800', fontFamily: 'monospace',
    color: '#4f46e5', letterSpacing: 2, marginVertical: 4
  },
  rosterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9'
  },
  studentName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  studentMeta: { fontSize: 11, color: '#64748b' },
  coursePercentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9'
  },
  courseName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  courseMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  percentValue: { fontSize: 18, fontWeight: '800' },
});
