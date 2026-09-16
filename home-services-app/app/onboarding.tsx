import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  SafeAreaView, StatusBar, FlatList, Animated, Image,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../src/store/settingsStore';
import { Colors, Typography, Spacing, Radius } from '../src/theme';

const { width, height } = Dimensions.get('window');

interface Slide {
  id: string;
  titleKey: string;
  descKey: string;
  gradient: readonly [string, string, string];
  image: any;
  accentColor: string;
  features: { icon: string; label: string }[];
  tagline: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    titleKey: 'onboarding.slide1Title',
    descKey: 'onboarding.slide1Desc',
    gradient: ['#1E3A5F', '#163058', '#0F2444'] as const,
    image: require('../assets/onboarding1.jpg'),
    accentColor: '#2E8B57',
    tagline: '100+ Services Available',
    features: [
      { icon: 'water-outline', label: 'Cleaning' },
      { icon: 'construct-outline', label: 'Plumbing' },
      { icon: 'flash-outline', label: 'Electrical' },
      { icon: 'thermometer-outline', label: 'AC Repair' },
    ],
  },
  {
    id: '2',
    titleKey: 'onboarding.slide2Title',
    descKey: 'onboarding.slide2Desc',
    gradient: ['#155E36', '#1A6E40', '#2E8B57'] as const,
    image: require('../assets/onboarding2.jpg'),
    accentColor: '#F59E0B',
    tagline: 'Earn on your own schedule',
    features: [
      { icon: 'list-outline', label: 'Receive Jobs' },
      { icon: 'wallet-outline', label: 'Earn Money' },
      { icon: 'card-outline', label: 'Withdraw Funds' },
      { icon: 'shield-checkmark-outline', label: 'Verified Profile' },
    ],
  },
  {
    id: '3',
    titleKey: 'onboarding.slide3Title',
    descKey: 'onboarding.slide3Desc',
    gradient: ['#4338CA', '#5046E4', '#6366F1'] as const,
    image: require('../assets/onboarding3.jpg'),
    accentColor: '#F59E0B',
    tagline: 'Safe & Secure Payments',
    features: [
      { icon: 'lock-closed-outline', label: 'Escrow' },
      { icon: 'card-outline', label: 'Visa / Mastercard' },
      { icon: 'shield-checkmark-outline', label: 'SSL Secured' },
      { icon: 'checkmark-circle-outline', label: 'Satisfaction' },
    ],
  },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { setOnboardingSeen, languageSelected } = useSettingsStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleFinishOnboarding();
    }
  };

  const handleFinishOnboarding = async () => {
    await setOnboardingSeen();
    if (languageSelected) {
      router.replace('/(auth)/login');
    } else {
      router.replace('/language');
    }
  };

  const handleSkip = () => handleFinishOnboarding();
  const handleGetStarted = () => handleFinishOnboarding();

  const onViewRef = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  });
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <LinearGradient colors={item.gradient} style={styles.slideGradient}>
        {/* Image area */}
        <View style={styles.imageContainer}>
          {/* Decorative rings */}
          <View style={[styles.ring, styles.ring1, { borderColor: item.accentColor + '25' }]} />
          <View style={[styles.ring, styles.ring2, { borderColor: item.accentColor + '15' }]} />

          <Image
            source={item.image}
            style={styles.slideImage}
            resizeMode="cover"
          />

          {/* Tagline badge */}
          <View style={[styles.taglineBadge, { backgroundColor: item.accentColor }]}>
            <Ionicons name="sparkles" size={12} color="#fff" />
            <Text style={styles.taglineText}>{item.tagline}</Text>
          </View>
        </View>

        {/* Feature pills */}
        <View style={styles.featurePills}>
          {item.features.map((f, i) => (
            <View key={i} style={[styles.featurePill, { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name={f.icon as any} size={14} color="#fff" />
              <Text style={styles.featurePillText}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* Text */}
        <View style={styles.textArea}>
          <Text style={styles.slideTitle}>{t(item.titleKey)}</Text>
          <Text style={styles.slideDesc}>{t(item.descKey)}</Text>
        </View>
      </LinearGradient>
    </View>
  );

  const slide = SLIDES[currentIndex];
  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>{t('common.skip')}</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewRef.current}
        viewabilityConfig={viewConfigRef.current}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      />

      {/* Bottom controls */}
      <LinearGradient colors={slide.gradient} style={styles.bottomControls}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange, outputRange: [8, 28, 8], extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity, backgroundColor: slide.accentColor }]}
              />
            );
          })}
        </View>

        {/* Next button */}
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: slide.accentColor }]}
          onPress={handleNext}
          activeOpacity={0.88}
        >
          <Text style={styles.nextBtnText}>
            {isLast ? t('common.getStarted') : t('common.next')}
          </Text>
          <Ionicons
            name={isLast ? 'rocket-outline' : 'arrow-forward'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F2444' },
  skipBtn: {
    position: 'absolute', top: 56, right: 24, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  skipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  slide: { width, flex: 1 },
  slideGradient: { flex: 1 },
  imageContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative',
    paddingTop: 60,
  },
  ring: {
    position: 'absolute', borderRadius: 999, borderWidth: 1,
  },
  ring1: { width: 260, height: 260 },
  ring2: { width: 340, height: 340 },
  slideImage: {
    width: width * 0.82,
    height: height * 0.38,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  taglineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: Radius.full,
    position: 'absolute', bottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  taglineText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  featurePills: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 8, paddingHorizontal: 20, paddingTop: 20,
  },
  featurePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1,
  },
  featurePillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  textArea: { paddingHorizontal: 32, paddingBottom: 20, paddingTop: 16 },
  slideTitle: {
    fontSize: 26, fontWeight: '900', color: '#fff',
    textAlign: 'center', marginBottom: Spacing.sm, lineHeight: 34,
  },
  slideDesc: {
    fontSize: 15, color: 'rgba(255,255,255,0.78)',
    textAlign: 'center', lineHeight: 24,
  },
  bottomControls: {
    paddingHorizontal: Spacing.xxl, paddingTop: Spacing.xl, paddingBottom: 40, gap: Spacing.xl,
  },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: Radius.full },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, padding: Spacing.xl, borderRadius: Radius.xl,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  nextBtnText: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.extrabold },
});
