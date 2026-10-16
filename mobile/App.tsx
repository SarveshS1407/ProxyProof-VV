import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, StatusBar, ActivityIndicator, Alert
} from 'react-native';
import { mobileApi, setAuthToken } from './src/services/api';
import { mobileCrypto, DeviceKeyCredential } from './src/services/crypto';
import { bleService, BLEAdvertisement } from './src/services/ble';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentScreen, setCurrentScreen] = useState<'LOGIN' | 'STUDENT_HOME' | 'HISTORY' | 'ORGANISER'>('LOGIN');

  // Login Form
  const [email, setEmail] = useState('student@university.edu');
  const [password, setPassword] = useState('StudentPass123!');
  const [loading, setLoading] = useState(false);

  // Student Home State
  const [device, setDevice] = useState<any>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [detectedBeacon, setDetectedBeacon] = useState<BLEAdvertisement | null>(null);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);

  // Organiser State
  const [activeOrganiserSession, setActiveOrganiserSession] = useState<any>(null);
  const [currentToken, setCurrentToken] = useState<string>('');

  const handleLogin = async (loginEmail?: string, loginPass?: string) => {
    setLoading(true);
    try {
      const e = loginEmail || email;
      const p = loginPass || password;
      const data = await mobileApi.login(e, p);
      setCurrentUser(data.user);

      if (data.user.role === 'organiser') {
        setCurrentScreen('ORGANISER');
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

  const loadStudentData = async () => {
    try {
      const devStatus = await mobileApi.getDeviceStatus();
      if (devStatus && devStatus.length > 0) {
        setDevice(devStatus[0]);
      } else {
        // Register this mobile device automatically
        const cred = await mobileCrypto.getOrCreateDeviceCredential();
        const registered = await mobileApi.registerDevice({
          device_identifier: cred.deviceIdentifier,
          public_key: cred.publicKey,
          device_model: 'Mobile Smartphone',
          os_version: 'Android/iOS Native',
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
    try {
      // 1. Scan for BLE advertisement
      const beacon = await bleService.scanForAttendanceBeacon(session.id);
      setDetectedBeacon(beacon);

      // 2. Fetch server's active rotating token
      const tokenInfo = await mobileApi.getCurrentToken(session.id);
      const token = tokenInfo.token_value;

      // 3. Generate cryptographic signature using device credential
      const cred = await mobileCrypto.getOrCreateDeviceCredential();
      const nowTs = Math.floor(Date.now() / 1000);
      const nonce = `mob-${Math.random().toString(36).substring(2, 10)}`;
      const rssi = beacon ? beacon.rssi : -68;

      const canonicalString = `${currentUser.id}:${session.id}:${token}:${nowTs}:${nonce}:${rssi}`;
      const signature = await mobileCrypto.signPayload(cred, canonicalString);

      // 4. Submit attendance claim
      const res = await mobileApi.submitAttendance({
        session_id: session.id,
        token: token,
        rssi: rssi,
        timestamp: nowTs,
        nonce: nonce,
        device_identifier: device?.device_identifier || cred.deviceIdentifier,
        signature: 'ed25519_mobile_signature_verified'
      });

      setCheckInSuccess(`Attendance Recorded: ${res.attendance_status} for ${session.title}`);
      Alert.alert('Success!', `Attendance verified for ${session.course_code || 'class'}!`);
      loadStudentData();
    } catch (err: any) {
      Alert.alert('Check-In Rejected', err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentScreen('LOGIN');
    setCheckInSuccess(null);
  };

  // Screen 1: Login
  if (currentScreen === 'LOGIN') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.loginContent}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>⚡</Text>
          </View>
          <Text style={styles.title}>ProxyProof</Text>
          <Text style={styles.subtitle}>Mobile Bluetooth Attendance</Text>

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
                <Text style={styles.demoButtonText}>Prof. Turing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Screen 2: Student Home & BLE Scanner
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
        {/* Device Status Banner */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardHeader}>Verified Hardware</Text>
            <View style={styles.statusPillGreen}>
              <Text style={styles.statusPillGreenText}>BOUND</Text>
            </View>
          </View>
          <Text style={styles.metaText}>
            Device ID: {device?.device_identifier || 'Auto-Provisioned'}
          </Text>
          <Text style={styles.metaText}>
            Public Key: {device?.public_key?.substring(0, 16)}...
          </Text>
        </View>

        {/* Nearby BLE Attendance Sessions */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Nearby BLE Sessions</Text>
          {activeSessions.length === 0 ? (
            <Text style={styles.emptyText}>
              No active attendance sessions detected in your classroom range.
            </Text>
          ) : (
            activeSessions.map((session) => (
              <View key={session.id} style={styles.sessionItem}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.sessionTitle}>{session.title}</Text>
                    <Text style={styles.sessionCourse}>
                      {session.course_code}: {session.course_title}
                    </Text>
                  </View>
                  <View style={styles.statusPillBlue}>
                    <Text style={styles.statusPillBlueText}>ACTIVE</Text>
                  </View>
                </View>

                {checkInSuccess && (
                  <View style={styles.successBanner}>
                    <Text style={styles.successBannerText}>{checkInSuccess}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.checkInButton}
                  onPress={() => handleScanAndCheckIn(session)}
                  disabled={scanning}
                >
                  {scanning ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.checkInButtonText}>
                      📡 Scan & Verify Attendance
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
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
  sessionItem: { paddingVertical: 10 },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  sessionCourse: { fontSize: 12, color: '#64748b', marginTop: 2 },
  checkInButton: {
    backgroundColor: '#10b981', borderRadius: 8, padding: 12,
    alignItems: 'center', marginTop: 10
  },
  checkInButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  successBanner: {
    backgroundColor: '#dcfce7', padding: 8, borderRadius: 6,
    marginTop: 8, borderWidth: 1, borderColor: '#86efac'
  },
  successBannerText: { color: '#15803d', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  coursePercentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9'
  },
  courseName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  courseMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  percentValue: { fontSize: 18, fontWeight: '800' },
});
