import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  StatusBar, TextInput, Alert, ActivityIndicator, Platform
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/store/authStore';
import { API } from '../../../src/config/api';
import { StepIndicator } from '../../../src/components/ui/StepIndicator';

const SERVICES: Record<string, { name: string; iconName: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; options: { label: string; price: number }[] }> = {
  cleaning:    { name: 'Cleaning',     iconName: 'water-outline',         options: [{ label: 'Studio / 1BR', price: 80 }, { label: '2BR Apartment', price: 120 }, { label: '3BR Apartment', price: 160 }, { label: 'Villa', price: 250 }] },
  plumbing:    { name: 'Plumbing',     iconName: 'construct-outline',      options: [{ label: 'Pipe Repair', price: 100 }, { label: 'Leak Fix', price: 120 }, { label: 'Installation', price: 180 }] },
  ac:          { name: 'AC Repair',    iconName: 'thermometer-outline',    options: [{ label: 'Service & Clean', price: 150 }, { label: 'Gas Refill', price: 200 }, { label: 'Full Repair', price: 350 }] },
  electrical:  { name: 'Electrician', iconName: 'flash-outline',          options: [{ label: 'Switch / Socket', price: 80 }, { label: 'Wiring', price: 200 }, { label: 'Circuit Breaker', price: 150 }] },
  painting:    { name: 'Painting',     iconName: 'color-palette-outline',  options: [{ label: 'One Room', price: 200 }, { label: 'Full Apartment', price: 600 }, { label: 'Villa', price: 1200 }] },
  maintenance: { name: 'Maintenance',  iconName: 'settings-outline',       options: [{ label: 'General Fix', price: 90 }, { label: 'Carpentry', price: 150 }, { label: 'Full Inspection', price: 250 }] },
};

const TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

export default function CreateBooking() {
  const { category, categoryName } = useLocalSearchParams<{ category: string; categoryName: string }>();
  const { user } = useAuthStore();
  // Fall back to cleaning when opened without a category, and send the category that is actually shown.
  const categoryKey = SERVICES[category as string] ? (category as string) : 'cleaning';
  const service = SERVICES[categoryKey];

  const [selectedOption, setSelectedOption] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');

  // Step Calculation
  const currentStep = !selectedDate ? 1 : !selectedTime ? 2 : !address.trim() ? 3 : 4;

  const BOOKING_STEPS = [
    { label: 'Option', stepNumber: 1 },
    { label: 'Date & Time', stepNumber: 2 },
    { label: 'Location', stepNumber: 3 },
    { label: 'Payment', stepNumber: 4 },
  ];

  const PAYMENT_OPTIONS = [
    { id: 'card',   label: 'Credit / Debit Card', icon: 'card-outline' as const,  color: '#1E3A5F' },
    { id: 'paypal', label: 'PayPal',              icon: 'globe-outline' as const, color: '#003087' },
    { id: 'apple',  label: Platform.OS === 'ios' ? 'Apple Pay' : 'Google Pay', icon: Platform.OS === 'ios' ? 'logo-apple' as const : 'logo-google' as const, color: '#000' },
  ];

  const formatCardNumber = (t: string) => t.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim();
  const formatExpiry = (t: string) => { const c = t.replace(/\D/g,'').slice(0,4); return c.length >= 2 ? c.slice(0,2)+'/'+c.slice(2) : c; };

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1);
    return { date: d.toISOString().split('T')[0], label: d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' }) };
  });

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const handleBook = async () => {
    if (!selectedDate) { Alert.alert('Error', 'Please select a date'); return; }
    if (!selectedTime) { Alert.alert('Error', 'Please select a time'); return; }
    if (!address.trim()) { Alert.alert('Error', 'Please enter your address'); return; }
    if (paymentMethod === 'card' && (!cardNumber || !cardExpiry || !cardCVV)) {
      Alert.alert('Error', 'Please fill in all card details'); return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const price = service.options[selectedOption].price;
      const res = await fetch(`${API}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: categoryKey, categoryName: service.name,
          serviceOption: service.options[selectedOption].label,
          price, scheduledDate: selectedDate,
          scheduledTime: selectedTime,
          address, notes,
          customerName: user?.name,
          customerPhone: user?.phone,
          paymentMethod,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create booking');

      // Go straight to the order so the customer can watch proposals arrive.
      Alert.alert('✅', data.message || 'Your request has been sent to available providers.');
      router.replace({ pathname: '/(customer)/booking/[id]', params: { id: data._id } });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.topTitle}>
          <Ionicons name={service.iconName} size={20} color="#2E8B57" />
          <Text style={styles.topTitleText}>{service.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <StepIndicator currentStep={currentStep} steps={BOOKING_STEPS} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Service Options */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Select Service Type</Text>
          {service.options.map((opt, i) => (
            <TouchableOpacity key={i} style={[styles.optionRow, selectedOption === i && styles.optionActive]} onPress={() => setSelectedOption(i)}>
              <View style={styles.optionLeft}>
                <View style={[styles.radio, selectedOption === i && styles.radioActive]}>
                  {selectedOption === i && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionLabel, selectedOption === i && styles.optionLabelActive]}>{opt.label}</Text>
              </View>
              <Text style={[styles.optionPrice, selectedOption === i && styles.optionPriceActive]}>SAR {opt.price}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="calendar-outline" size={18} color="#0F172A" />
            <Text style={styles.sectionLabel}>Select Date</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {days.map((d) => (
              <TouchableOpacity key={d.date} style={[styles.dayChip, selectedDate === d.date && styles.dayChipActive]} onPress={() => setSelectedDate(d.date)}>
                <Text style={[styles.dayText, selectedDate === d.date && styles.dayTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Time Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="time-outline" size={18} color="#0F172A" />
            <Text style={styles.sectionLabel}>Select Time</Text>
          </View>
          <View style={styles.timeGrid}>
            {TIMES.map((t) => (
              <TouchableOpacity key={t} style={[styles.timeChip, selectedTime === t && styles.timeChipActive]} onPress={() => setSelectedTime(t)}>
                <Text style={[styles.timeText, selectedTime === t && styles.timeTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="location-outline" size={18} color="#0F172A" />
            <Text style={styles.sectionLabel}>Service Address / العنوان</Text>
          </View>
          <TextInput style={styles.input} placeholder="Enter full address (District, Street, City)" placeholderTextColor="#94A3B8" value={address} onChangeText={setAddress} multiline />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="create-outline" size={18} color="#0F172A" />
            <Text style={styles.sectionLabel}>Notes (Optional)</Text>
          </View>
          <TextInput style={[styles.input, { height: 80 }]} placeholder="Any special instructions..." placeholderTextColor="#94A3B8" value={notes} onChangeText={setNotes} multiline />
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="card-outline" size={18} color="#0F172A" />
            <Text style={styles.sectionLabel}>Payment Method</Text>
          </View>
          <View style={styles.payGrid}>
            {PAYMENT_OPTIONS.map((pm) => (
              <TouchableOpacity
                key={pm.id}
                style={[styles.payOption, paymentMethod === pm.id && styles.payOptionActive]}
                onPress={() => setPaymentMethod(pm.id)}
              >
                <Ionicons name={pm.icon} size={20} color={paymentMethod === pm.id ? '#fff' : pm.color} />
                <Text style={[styles.payOptionText, paymentMethod === pm.id && styles.payOptionTextActive]}>
                  {pm.label}
                </Text>
                {paymentMethod === pm.id && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>

          {paymentMethod === 'card' && (
            <View style={styles.cardInputs}>
              <TextInput
                style={styles.cardInput}
                placeholder="Card Number"
                placeholderTextColor="#94A3B8"
                value={cardNumber}
                onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                keyboardType="number-pad" maxLength={19}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.cardInput, { flex: 1 }]}
                  placeholder="MM/YY"
                  placeholderTextColor="#94A3B8"
                  value={cardExpiry}
                  onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                  keyboardType="number-pad" maxLength={5}
                />
                <TextInput
                  style={[styles.cardInput, { flex: 1 }]}
                  placeholder="CVV"
                  placeholderTextColor="#94A3B8"
                  value={cardCVV} onChangeText={setCardCVV}
                  keyboardType="number-pad" maxLength={3} secureTextEntry
                />
              </View>
              <View style={styles.secureRow}>
                <Ionicons name="lock-closed" size={12} color="#94A3B8" />
                <Text style={styles.secureText}>Secured by 256-bit SSL</Text>
              </View>
            </View>
          )}

          {paymentMethod === 'paypal' && (
            <View style={styles.paypalNote}>
              <Ionicons name="information-circle-outline" size={16} color="#003087" />
              <Text style={styles.paypalNoteText}>You will be redirected to PayPal to complete payment after booking.</Text>
            </View>
          )}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service</Text>
            <Text style={styles.summaryValue}>{service.options[selectedOption].label}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Date & Time</Text>
            <Text style={styles.summaryValue}>{selectedDate || '—'} {selectedTime}</Text>
          </View>
          <View style={[styles.summaryRow, { borderBottomWidth: 0, marginTop: 4 }]}>
            <Text style={styles.summaryLabel}>Total Amount</Text>
            <Text style={styles.summaryTotal}>SAR {service.options[selectedOption].price}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.bookBtn} onPress={handleBook} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <View style={styles.btnInner}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.bookBtnText}>Confirm Booking · SAR {service.options[selectedOption].price}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  payOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  payOptionActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  payOptionText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  payOptionTextActive: { color: '#fff' },
  cardInputs: { gap: 10, marginTop: 4 },
  cardInput: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A' },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  secureText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  paypalNote: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', padding: 12, borderRadius: 12, marginTop: 4 },
  paypalNoteText: { fontSize: 12, color: '#1D4ED8', fontWeight: '600', flex: 1, lineHeight: 18 },
  cashNote: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, marginTop: 4 },
  cashNoteText: { fontSize: 12, color: '#2E8B57', fontWeight: '600', flex: 1, lineHeight: 18 },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  topTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitleText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  section: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 14, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 8 },
  optionActive: { borderColor: '#2E8B57', backgroundColor: '#F0FDF4' },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
  radioActive: { borderColor: '#2E8B57' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2E8B57' },
  optionLabel: { fontSize: 15, color: '#334155', fontWeight: '600' },
  optionLabelActive: { color: '#2E8B57' },
  optionPrice: { fontSize: 15, fontWeight: '700', color: '#64748B' },
  optionPriceActive: { color: '#2E8B57' },
  dayChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1.5, borderColor: '#E2E8F0' },
  dayChipActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  dayText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  dayTextActive: { color: '#fff' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0' },
  timeChipActive: { backgroundColor: '#2E8B57', borderColor: '#2E8B57' },
  timeText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  timeTextActive: { color: '#fff' },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, fontSize: 15, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' },
  summary: { marginHorizontal: 16, marginTop: 14, backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  summaryLabel: { fontSize: 14, color: '#64748B' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  summaryTotal: { fontSize: 22, fontWeight: '900', color: '#2E8B57' },
  bookBtn: { margin: 16, backgroundColor: '#2E8B57', padding: 20, borderRadius: 18, alignItems: 'center', shadowColor: '#2E8B57', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
