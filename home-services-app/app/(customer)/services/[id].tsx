import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ServiceDetails() {
  const { id } = useLocalSearchParams();

  // Mock service data
  const service = {
    id,
    name: 'Home Cleaning',
    description: 'Professional cleaning services for your home. Includes dusting, vacuuming, mopping, and bathroom cleaning. We use eco-friendly products to ensure a safe environment for your family.',
    price: 'SAR 150',
    duration: '2 Hours',
    rating: '4.8',
    reviews: 124,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Service Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.imagePlaceholder}>
          <Ionicons name="sparkles" size={80} color="#2E8B57" />
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{service.name}</Text>
            <Text style={styles.price}>{service.price}</Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={16} color="#F59E0B" />
              <Text style={styles.metaText}>{service.rating} ({service.reviews} reviews)</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time" size={16} color="#64748B" />
              <Text style={styles.metaText}>{service.duration}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{service.description}</Text>
          
          <Text style={styles.sectionTitle}>What's included?</Text>
          <View style={styles.includedList}>
            {[
              'Living room & bedrooms cleaning',
              'Kitchen & bathrooms cleaning',
              'Floor vacuuming & mopping',
              'Dusting all surfaces'
            ].map((item, idx) => (
              <View key={idx} style={styles.includedItemRow}>
                <Ionicons name="checkmark-circle" size={20} color="#2E8B57" style={{ marginRight: 10 }} />
                <Text style={styles.includedText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.bookBtn}
          onPress={() => router.push({ pathname: '/(customer)/booking/create', params: { category: String(id), categoryName: service.name } })}
        >
          <Text style={styles.bookBtnText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  imagePlaceholder: {
    height: 200,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { padding: 24 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', flex: 1 },
  price: { fontSize: 24, fontWeight: '900', color: '#2E8B57' },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 16,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 12, marginTop: 12 },
  description: { fontSize: 15, color: '#475569', lineHeight: 24, marginBottom: 24 },
  includedList: { marginBottom: 32, gap: 10 },
  includedItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  includedText: { fontSize: 15, color: '#334155', fontWeight: '500' },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  bookBtn: {
    backgroundColor: '#2E8B57',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#2E8B57',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6
  },
  bookBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
