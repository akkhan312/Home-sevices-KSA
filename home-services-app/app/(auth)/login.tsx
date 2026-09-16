import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, StatusBar, Image, Dimensions, Animated, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { API, fetchWithTimeout } from '../../src/config/api';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../src/theme';

const AUTH_API = `${API}/auth`;
const { width } = Dimensions.get('window');

const SAUDI_CITIES = [
  'Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Al Khobar',
  'Taif', 'Tabuk', 'Abha', 'Khamis Mushait', 'Jubail', 'Yanbu',
];

const SERVICE_CATEGORIES = [
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'ac', label: 'AC Repair' },
  { id: 'electrical', label: 'Electrician' },
  { id: 'painting', label: 'Painting' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'carpentry', label: 'Carpentry' },
  { id: 'gardening', label: 'Gardening' },
];

type Mode = 'login' | 'signup-choose' | 'signup-customer' | 'signup-provider';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { setUser } = useAuthStore();
  const { language } = useSettingsStore();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [iqamaNumber, setIqamaNumber] = useState('');
  const [city, setCity] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [iban, setIban] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Provider OTP Verification State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateModeChange = (newMode: Mode) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setMode(newMode);
    setErrorMsg('');
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email || !email.includes('@')) { setErrorMsg(t('auth.invalidEmail')); return; }
    if (!password || password.length < 6) { setErrorMsg(t('auth.passwordMin')); return; }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('auth.loginFailed'));

      setUser(data.user, data.token);
      if (data.user.role === 'admin') router.replace('/(admin)');
      else if (data.user.role === 'provider') router.replace('/(provider)');
      else router.replace('/(customer)');
    } catch (e: any) {
      setErrorMsg(e.message || t('auth.loginFailed'));
    } finally { setLoading(false); }
  };

  const handleVerifyProviderOtp = async () => {
    if (!otpCode || otpCode.length !== 4) {
      Alert.alert('Invalid Code', 'Please enter the 4-digit verification code.');
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await fetchWithTimeout(`${AUTH_API}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid verification code');

      setShowVerifyModal(false);
      setUser(pendingUser, pendingToken);
      router.replace('/(provider)');
    } catch (e: any) {
      Alert.alert('Verification Failed', e.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendProviderOtp = async () => {
    try {
      await fetchWithTimeout(`${AUTH_API}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser?.email }),
      });
      Alert.alert('Verification Code Sent', `A new verification code was sent to ${pendingUser?.email}.`);
    } catch {
      Alert.alert('Error', 'Could not send a new code. Please try again.');
    }
  };

  const handleSignup = async () => {
    setErrorMsg('');
    if (!name) { setErrorMsg(t('auth.fillAllFields')); return; }
    if (!email || !email.includes('@')) { setErrorMsg(t('auth.invalidEmail')); return; }
    if (!password || password.length < 6) { setErrorMsg(t('auth.passwordMin')); return; }
    if (!phone) { setErrorMsg(t('auth.fillAllFields')); return; }

    const isProvider = mode === 'signup-provider';
    if (isProvider && !iqamaNumber) { setErrorMsg(t('auth.iqamaRequired')); return; }

    setLoading(true);
    try {
      const body: any = {
        email: email.toLowerCase().trim(),
        password, name, phone,
        role: isProvider ? 'provider' : 'customer',
      };
      if (isProvider) {
        body.iqamaNumber = iqamaNumber;
        body.city = city;
        body.serviceCategories = selectedCategories;
        body.iban = iban;
      }
      const res = await fetchWithTimeout(`${AUTH_API}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('auth.signupFailed'));
      setUser(data.user, data.token);
      if (data.user.role === 'provider') router.replace('/(provider)');
      else router.replace('/(customer)');
    } catch (e: any) {
      setErrorMsg(e.message || t('auth.signupFailed'));
    } finally { setLoading(false); }
  };

  const renderInput = (
    icon: string, placeholder: string, value: string,
    onChange: (t: string) => void, options?: {
      keyboardType?: any; secureTextEntry?: boolean;
      maxLength?: number; autoCapitalize?: any;
    }
  ) => (
    <View style={styles.inputWrapper}>
      <Ionicons name={icon as any} size={18} color={Colors.textMuted} style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChange}
        {...options}
      />
      {options?.secureTextEntry !== undefined && (
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
          <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={Colors.gradientHero} style={styles.container}>

        {/* Header brand area */}
        <View style={styles.brandArea}>
          <View style={styles.logoCircle}>
            <Ionicons name="home" size={36} color="#fff" />
          </View>
          <Text style={styles.brand}>ServeHome</Text>
          <Text style={styles.brandSub}>الخدمات المنزلية • Home Services</Text>
        </View>

        {/* Card */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.card, { opacity: fadeAnim }]}>

            {/* ── LOGIN MODE ── */}
            {mode === 'login' && (
              <>
                <Text style={styles.cardTitle}>{t('auth.welcome')}</Text>
                <Text style={styles.cardSub}>{t('auth.welcomeSub')}</Text>

                {!!errorMsg && <ErrorBanner msg={errorMsg} />}

                {renderInput('mail-outline', t('auth.email'), email, setEmail, { keyboardType: 'email-address', autoCapitalize: 'none' })}
                {renderInput('lock-closed-outline', t('auth.password'), password, setPassword, { secureTextEntry: !showPassword })}

                <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/(auth)/forgot-password')}>
                  <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={Colors.gradientAccent} style={styles.btnGradient}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={styles.btnText}>{t('auth.login')}</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeBtn}
                  onPress={() => animateModeChange('signup-choose')}
                >
                  <Text style={styles.switchModeText}>{t('auth.noAccount')}</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── CHOOSE ROLE ── */}
            {mode === 'signup-choose' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => animateModeChange('login')}>
                  <Ionicons name="arrow-back" size={18} color={Colors.accent} />
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </TouchableOpacity>

                <Text style={styles.cardTitle}>{t('auth.createAccount')}</Text>
                <Text style={styles.cardSub}>Who are you joining as?</Text>

                <TouchableOpacity
                  style={styles.roleCard}
                  onPress={() => animateModeChange('signup-customer')}
                  activeOpacity={0.88}
                >
                  <LinearGradient colors={Colors.gradientPrimary} style={styles.roleIconBox}>
                    <Ionicons name="person" size={32} color="#fff" />
                  </LinearGradient>
                  <View style={styles.roleTextBox}>
                    <Text style={styles.roleName}>{t('auth.customer')}</Text>
                    <Text style={styles.roleDesc}>{t('auth.iNeedServices')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.roleCard}
                  onPress={() => animateModeChange('signup-provider')}
                  activeOpacity={0.88}
                >
                  <LinearGradient colors={Colors.gradientAccent} style={styles.roleIconBox}>
                    <Ionicons name="build" size={32} color="#fff" />
                  </LinearGradient>
                  <View style={styles.roleTextBox}>
                    <Text style={styles.roleName}>{t('auth.provider')}</Text>
                    <Text style={styles.roleDesc}>{t('auth.iProvideServices')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeBtn}
                  onPress={() => animateModeChange('login')}
                >
                  <Text style={styles.switchModeText}>{t('auth.alreadyHaveAccount')}</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── CUSTOMER SIGNUP ── */}
            {mode === 'signup-customer' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => animateModeChange('signup-choose')}>
                  <Ionicons name="arrow-back" size={18} color={Colors.accent} />
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </TouchableOpacity>

                <Text style={styles.cardTitle}>{t('auth.createAccount')}</Text>
                <Text style={styles.cardSub}>{t('auth.customer')}</Text>

                {!!errorMsg && <ErrorBanner msg={errorMsg} />}

                {renderInput('person-outline', t('auth.name'), name, setName)}
                {renderInput('mail-outline', t('auth.email'), email, setEmail, { keyboardType: 'email-address', autoCapitalize: 'none' })}
                {renderInput('lock-closed-outline', t('auth.password'), password, setPassword, { secureTextEntry: !showPassword })}
                {renderInput('call-outline', `${t('auth.phone')} (05XXXXXXXX)`, phone, setPhone, { keyboardType: 'phone-pad' })}

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
                  onPress={handleSignup}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={Colors.gradientAccent} style={styles.btnGradient}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={styles.btnText}>{t('auth.signup')}</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* ── PROVIDER SIGNUP ── */}
            {mode === 'signup-provider' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => animateModeChange('signup-choose')}>
                  <Ionicons name="arrow-back" size={18} color={Colors.accent} />
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </TouchableOpacity>

                <Text style={styles.cardTitle}>{t('auth.createAccount')}</Text>
                <Text style={styles.cardSub}>{t('auth.provider')}</Text>

                {!!errorMsg && <ErrorBanner msg={errorMsg} />}

                {renderInput('person-outline', t('auth.name'), name, setName)}
                {renderInput('mail-outline', t('auth.email'), email, setEmail, { keyboardType: 'email-address', autoCapitalize: 'none' })}
                {renderInput('lock-closed-outline', t('auth.password'), password, setPassword, { secureTextEntry: !showPassword })}
                {renderInput('call-outline', `${t('auth.phone')} (05XXXXXXXX)`, phone, setPhone, { keyboardType: 'phone-pad' })}
                {renderInput('card-outline', `${t('auth.iqama')} (10 digits)`, iqamaNumber, setIqamaNumber, { keyboardType: 'numeric', maxLength: 10 })}

                {/* City picker */}
                <Text style={styles.fieldLabel}>{t('auth.city')}</Text>
                <TouchableOpacity style={styles.inputWrapper} onPress={() => setShowCityPicker(!showCityPicker)}>
                  <Ionicons name="location-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <Text style={[styles.input, !city && { color: Colors.textMuted }]}>
                    {city || t('auth.selectCity')}
                  </Text>
                  <Ionicons name={showCityPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} style={{ paddingRight: 14 }} />
                </TouchableOpacity>
                {showCityPicker && (
                  <View style={styles.pickerList}>
                    {SAUDI_CITIES.map(c => (
                      <TouchableOpacity key={c} style={styles.pickerItem} onPress={() => { setCity(c); setShowCityPicker(false); }}>
                        <Text style={[styles.pickerItemText, c === city && { color: Colors.accent, fontWeight: Typography.bold }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Service categories */}
                <Text style={styles.fieldLabel}>{t('auth.serviceCategories')}</Text>
                <View style={styles.categoriesGrid}>
                  {SERVICE_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.catChip, selectedCategories.includes(cat.id) && styles.catChipActive]}
                      onPress={() => toggleCategory(cat.id)}
                    >
                      <Text style={[styles.catChipText, selectedCategories.includes(cat.id) && styles.catChipTextActive]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {renderInput('card-outline', `${t('auth.iban')} (SA...)`, iban, setIban, { autoCapitalize: 'characters' })}

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
                  onPress={handleSignup}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={Colors.gradientAccent} style={styles.btnGradient}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Text style={styles.btnText}>{t('auth.signup')}</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

          </Animated.View>
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Provider Verification Modal */}
        <Modal visible={showVerifyModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Ionicons name="shield-checkmark" size={24} color="#2E8B57" />
                <Text style={styles.modalTitle}>Provider Dashboard Verification</Text>
              </View>
              <Text style={styles.modalSub}>
                A 4-digit verification code was sent to <Text style={{ fontWeight: 'bold' }}>{pendingUser?.email}</Text>. Enter the code to access your provider dashboard.
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
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

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleVerifyProviderOtp}
                disabled={verifyingOtp}
              >
                <LinearGradient colors={Colors.gradientAccent} style={styles.btnGradient}>
                  {verifyingOtp ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Text style={styles.btnText}>Verify & Enter Dashboard</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleResendProviderOtp} style={{ alignItems: 'center', marginTop: 10 }}>
                <Text style={{ color: Colors.accent, fontWeight: '700', fontSize: 13 }}>Resend Verification Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const ErrorBanner: React.FC<{ msg: string }> = ({ msg }) => (
  <View style={styles.errorBanner}>
    <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
    <Text style={styles.errorText}>{msg}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandArea: { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 24 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
    ...Shadows.accent,
  },
  brand: { fontSize: Typography.hero, fontWeight: Typography.black, color: '#fff', letterSpacing: -1 },
  brandSub: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxxl,
    padding: 28,
    ...Shadows.xl,
  },
  cardTitle: { fontSize: Typography.heading, fontWeight: Typography.black, color: Colors.textPrimary, marginBottom: 4 },
  cardSub: { fontSize: Typography.base, color: Colors.textMuted, marginBottom: 24 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', padding: 12, borderRadius: Radius.md,
    marginBottom: 16, borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, fontWeight: Typography.semibold },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 14,
    minHeight: 52,
  },
  inputIcon: { paddingLeft: 14 },
  input: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, fontSize: Typography.md, color: Colors.textPrimary },
  eyeBtn: { padding: 14 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },
  primaryBtn: { borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 16, ...Shadows.accent },
  btnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.xl,
  },
  btnText: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.extrabold },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  divider: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: Typography.sm },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: Spacing.lg, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.border, marginBottom: 16,
  },
  googleIcon: { fontSize: 18, fontWeight: Typography.black, color: '#EA4335' },
  socialBtnText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  switchModeBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  switchModeText: { color: Colors.accent, fontSize: Typography.base, fontWeight: Typography.bold },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backText: { color: Colors.accent, fontWeight: Typography.semibold, fontSize: Typography.base },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.background, borderRadius: Radius.xl,
    padding: Spacing.xl, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  roleIconBox: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  roleTextBox: { flex: 1 },
  roleName: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.textPrimary },
  roleDesc: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: 6 },
  pickerList: {
    backgroundColor: '#fff', borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, marginBottom: 14, maxHeight: 180, overflow: 'hidden',
  },
  pickerItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  pickerItemText: { fontSize: Typography.base, color: Colors.textPrimary },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  catChipActive: { backgroundColor: Colors.accent + '15', borderColor: Colors.accent },
  catChipText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  catChipTextActive: { color: Colors.accent },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: Typography.black, color: Colors.textPrimary },
  modalSub: { fontSize: 13, color: Colors.textMuted, lineHeight: 20, marginBottom: 18 },
});
