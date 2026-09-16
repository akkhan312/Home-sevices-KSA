import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { apiFetch, appendFile, ApiError } from '../../services/apiClient';
import { Colors } from '../../theme';

interface Instructions {
  orderNumber: string | null;
  reference: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  rejectionReason: string | null;
  bank: { bankName: string; accountName: string; iban: string; accountNumber: string; instructions: string } | null;
}

interface PaymentPanelProps {
  booking: any;
  onBookingChange: (booking: any) => void;
  /** Optional card payment (shown only when Stripe is configured on this build). */
  onPayByCard?: () => void;
  cardBusy?: boolean;
}

const formatIban = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim();

/** Bank-transfer payment: instructions from admin settings, copy buttons, receipt + transaction number upload. */
export function PaymentPanel({ booking, onBookingChange, onPayByCard, cardBusy }: PaymentPanelProps) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<Instructions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [txn, setTxn] = useState('');
  const [receipt, setReceipt] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const status: string = booking.paymentStatus;
  const bookingId = booking._id;

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setInfo(await apiFetch<Instructions>(`/bookings/${bookingId}/payment-instructions`));
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, [bookingId]);

  useEffect(() => {
    if (status !== 'PAID') load();
  }, [load, status]);

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1800);
  };

  const pickReceipt = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!picked.canceled && picked.assets[0]) setReceipt(picked.assets[0]);
  };

  const submit = async () => {
    if (submitting) return; // prevents double taps creating duplicate submissions
    if (!receipt) return Alert.alert(t('workflow.payment.required'), t('workflow.payment.needReceipt'));
    if (txn.trim().length < 4) return Alert.alert(t('workflow.payment.required'), t('workflow.payment.needTransaction'));

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('transactionNumber', txn.trim());
      await appendFile(form, 'image', receipt);
      const updated = await apiFetch(`/bookings/${bookingId}/payment-proof`, { method: 'POST', form, timeoutMs: 60000 });
      onBookingChange(updated);
      setReceipt(null);
      setTxn('');
    } catch (e: any) {
      Alert.alert(t('workflow.payment.required'), e instanceof ApiError ? e.message : t('workflow.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'PENDING_VERIFICATION' || status === 'PAYMENT_SUBMITTED') {
    return (
      <View style={[styles.banner, styles.bannerWarn]}>
        <Ionicons name="time-outline" size={28} color="#B45309" />
        <View style={styles.bannerTextWrap}>
          <Text style={[styles.bannerTitle, { color: '#92400E' }]}>{t('workflow.payment.submittedTitle')}</Text>
          <Text style={styles.bannerBody}>{t('workflow.payment.submittedBody')}</Text>
        </View>
      </View>
    );
  }

  if (status === 'PAID') return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="card-outline" size={22} color={Colors.primary} />
        <Text style={styles.title}>{t('workflow.payment.required')}</Text>
      </View>

      {status === 'REJECTED' && (
        <View style={[styles.banner, styles.bannerError]}>
          <Ionicons name="alert-circle" size={22} color={Colors.error} />
          <View style={styles.bannerTextWrap}>
            <Text style={[styles.bannerTitle, { color: '#991B1B' }]}>{t('workflow.payment.rejectedTitle')}</Text>
            <Text style={styles.bannerBody}>{booking.paymentRejectionReason || t('workflow.payment.rejectedBody')}</Text>
          </View>
        </View>
      )}

      <Text style={styles.subTitle}>{t('workflow.payment.payToPlatform')}</Text>

      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>{t('workflow.payment.orderAmount')}</Text>
        <Text style={styles.amountValue}>SAR {Number(booking.price).toLocaleString()}</Text>
      </View>

      {!info && !loadError && <ActivityIndicator color={Colors.accent} style={{ marginVertical: 16 }} />}
      {!!loadError && (
        <TouchableOpacity onPress={load} style={styles.retry}>
          <Text style={styles.retryText}>{loadError} · {t('common.retry')}</Text>
        </TouchableOpacity>
      )}

      {info && !info.bank && <Text style={styles.bannerBody}>{t('workflow.payment.notConfigured')}</Text>}

      {info?.bank && (
        <View style={styles.bankBox}>
          <Row label={t('workflow.payment.bank')} value={info.bank.bankName} />
          <Row label={t('workflow.payment.accountName')} value={info.bank.accountName} />
          <Row label={t('workflow.payment.iban')} value={formatIban(info.bank.iban)} mono />
          {!!info.bank.accountNumber && <Row label={t('workflow.payment.accountNumber')} value={info.bank.accountNumber} mono />}
          <View style={styles.referenceBox}>
            <Text style={styles.label}>{t('workflow.payment.reference')}</Text>
            <Text style={styles.reference}>{info.reference}</Text>
            <Text style={styles.hint}>{t('workflow.payment.referenceHint')}</Text>
          </View>
          {!!info.bank.instructions && <Text style={styles.hint}>{info.bank.instructions}</Text>}

          <View style={styles.copyRow}>
            <TouchableOpacity style={styles.copyBtn} onPress={() => copy('iban', info.bank!.iban)}>
              <Ionicons name={copied === 'iban' ? 'checkmark' : 'copy-outline'} size={16} color={Colors.primary} />
              <Text style={styles.copyText}>{copied === 'iban' ? t('workflow.payment.copied') : t('workflow.payment.copyIban')}</Text>
            </TouchableOpacity>
            {!!info.bank.accountNumber && (
              <TouchableOpacity style={styles.copyBtn} onPress={() => copy('account', info.bank!.accountNumber)}>
                <Ionicons name={copied === 'account' ? 'checkmark' : 'copy-outline'} size={16} color={Colors.primary} />
                <Text style={styles.copyText}>{copied === 'account' ? t('workflow.payment.copied') : t('workflow.payment.copyAccount')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Text style={styles.label}>{t('workflow.payment.transactionNumber')}</Text>
      <TextInput
        style={styles.input}
        value={txn}
        onChangeText={setTxn}
        placeholder="e.g. 202610010123456"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="characters"
        maxLength={64}
      />

      <TouchableOpacity style={styles.attach} onPress={pickReceipt}>
        {receipt ? (
          <Image source={{ uri: receipt.uri }} style={styles.thumb} />
        ) : (
          <Ionicons name="receipt-outline" size={22} color={Colors.primary} />
        )}
        <Text style={styles.attachText}>{receipt ? t('workflow.payment.changeReceipt') : t('workflow.payment.attachReceipt')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.submit, submitting && { opacity: 0.7 }]} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('workflow.payment.submit')}</Text>}
      </TouchableOpacity>

      {onPayByCard && (
        <TouchableOpacity style={styles.cardBtn} onPress={onPayByCard} disabled={cardBusy}>
          {cardBusy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.cardBtnText}>{t('workflow.payment.payByCard')}</Text>}
        </TouchableOpacity>
      )}

      <View style={styles.escrowRow}>
        <Ionicons name="shield-checkmark" size={16} color={Colors.success} />
        <Text style={styles.escrowText}>{t('workflow.payment.escrow')}</Text>
      </View>
    </View>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  subTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 4, marginBottom: 10, textAlign: 'left' },
  amountBox: { backgroundColor: Colors.primary, borderRadius: 14, padding: 14, marginBottom: 12 },
  amountLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', textAlign: 'left' },
  amountValue: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 2, textAlign: 'left' },
  bankBox: { backgroundColor: Colors.background, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  row: { marginBottom: 10 },
  label: { fontSize: 11, color: Colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', marginBottom: 3, textAlign: 'left' },
  value: { fontSize: 15, color: Colors.textPrimary, fontWeight: '700', textAlign: 'left' },
  mono: { letterSpacing: 0.5 },
  referenceBox: { backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginBottom: 8 },
  reference: { fontSize: 20, fontWeight: '900', color: Colors.accentDark, textAlign: 'left' },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 18, textAlign: 'left' },
  copyRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#E0E7FF' },
  copyText: { color: Colors.primary, fontWeight: '800', fontSize: 12 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, height: 46, color: Colors.textPrimary, marginBottom: 12, backgroundColor: '#fff', textAlign: 'left' },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 14 },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  attachText: { color: Colors.primary, fontWeight: '800' },
  submit: { backgroundColor: Colors.accent, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  cardBtn: { height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, marginTop: 10 },
  cardBtnText: { color: Colors.primary, fontWeight: '800' },
  escrowRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12 },
  escrowText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17, textAlign: 'left' },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1 },
  bannerWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  bannerTextWrap: { flex: 1, marginLeft: 10 },
  bannerTitle: { fontWeight: '900', fontSize: 15, textAlign: 'left' },
  bannerBody: { color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 19, textAlign: 'left' },
  retry: { padding: 10 },
  retryText: { color: Colors.error, fontWeight: '700' },
});
