import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { API, fetchWithTimeout } from '../../src/config/api';
import { Colors, Shadows } from '../../src/theme';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');

  // Helper for safe JSON response parsing
  const parseJsonResponse = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Server returned unexpected response (${res.status}). Please try again.`);
    }
  };

  // Step 1: Send OTP to Email/Phone
  const handleSendOtp = async () => {
    setErrorMsg('');
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to send code');

      setOtpCode('');
      setStep(2);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify 4-digit OTP Code
  const handleVerifyOtp = async () => {
    setErrorMsg('');
    if (!otpCode || otpCode.length !== 4) {
      setErrorMsg('Please enter the 4-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), code: otpCode }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Invalid code');

      setResetToken(data.resetToken);
      setStep(3);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async () => {
    setErrorMsg('');
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, password: newPassword }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      Alert.alert(
        '🎉 Password Reset Complete',
        'Your password has been updated successfully. Please log in with your new password.',
        [{ text: 'Log In Now', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={Colors.gradientHero} style={styles.container}>

        {/* Brand Area */}
        <View style={styles.brandArea}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backTopBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.brand}>Forgot Password</Text>
          <Text style={styles.brandSub}>إعادة تعيين كلمة المرور</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            {/* Step Indicator */}
            <View style={styles.stepsRow}>
              {[1, 2, 3].map((s) => (
                <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]}>
                  <Text style={[styles.stepDotText, step >= s && styles.stepDotTextActive]}>{s}</Text>
                </View>
              ))}
            </View>

            {!!errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* STEP 1: Enter Email */}
            {step === 1 && (
              <>
                <Text style={styles.title}>Find Your Account</Text>
                <Text style={styles.subTitle}>Enter your registered email address to receive a 4-digit verification code.</Text>

                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="name@example.com"
                    placeholderTextColor={Colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity style={styles.btn} onPress={handleSendOtp} disabled={loading}>
                  <LinearGradient colors={Colors.gradientAccent} style={styles.btnGrad}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={styles.btnText}>Send Verification Code</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* STEP 2: Enter OTP */}
            {step === 2 && (
              <>
                <Text style={styles.title}>Verify Code</Text>
                <Text style={styles.subTitle}>Enter the 4-digit verification code sent to <Text style={{ fontWeight: 'bold' }}>{email}</Text>.</Text>

                <View style={styles.inputWrapper}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={[styles.input, { letterSpacing: 8, fontSize: 20, fontWeight: 'bold' }]}
                    placeholder="••••"
                    placeholderTextColor={Colors.textMuted}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>

                <TouchableOpacity style={styles.btn} onPress={handleVerifyOtp} disabled={loading}>
                  <LinearGradient colors={Colors.gradientAccent} style={styles.btnGrad}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={styles.btnText}>Verify & Continue</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleSendOtp} style={{ marginTop: 14, alignItems: 'center' }}>
                  <Text style={{ color: Colors.accent, fontWeight: '700', fontSize: 13 }}>Resend Code</Text>
                </TouchableOpacity>
              </>
            )}

            {/* STEP 3: Reset Password */}
            {step === 3 && (
              <>
                <Text style={styles.title}>Create New Password</Text>
                <Text style={styles.subTitle}>Your code is verified! Enter your new password below.</Text>

                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="New Password (min 6 chars)"
                    placeholderTextColor={Colors.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 12 }}>
                    <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm New Password"
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                  />
                </View>

                <TouchableOpacity style={styles.btn} onPress={handleResetPassword} disabled={loading}>
                  <LinearGradient colors={Colors.gradientAccent} style={styles.btnGrad}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={styles.btnText}>Update Password</Text>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandArea: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 20 },
  backTopBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  brand: { fontSize: 26, fontWeight: '900', color: '#fff' },
  brandSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 28, padding: 24, ...Shadows.xl },
  stepsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  stepDotActive: { backgroundColor: '#2E8B57', borderColor: '#2E8B57' },
  stepDotText: { fontSize: 14, fontWeight: '800', color: '#64748B' },
  stepDotTextActive: { color: '#fff' },
  title: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  subTitle: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600', flex: 1 },
  demoOtpBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' },
  demoOtpText: { color: '#2E8B57', fontSize: 13, fontWeight: '600' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 16, height: 52 },
  input: { flex: 1, paddingHorizontal: 12, fontSize: 15, color: '#0F172A' },
  btn: { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
