import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/authStore';
import { useFlipStyle } from '../../src/utils/rtl';

interface Message {
  id: string;
  text: string;
  isAi: boolean;
  time: Date;
  actions?: { label: string; route: Href }[];
}

/**
 * Help topics with English and Arabic keywords. Answers live in the translation files (`assistant.answers.*`) so they
 * describe the real ServeHome flow in the user's language.
 */
const TOPICS: { id: string; pattern: RegExp; actions?: { labelKey: string; route: Href }[] }[] = [
  { id: 'greeting', pattern: /^(hi|hello|hey|salam|ahlan|good (morning|evening))|مرحبا|السلام|اهلا|أهلا/ },
  { id: 'cancel', pattern: /cancel|refund|money back|إلغاء|الغاء|استرداد|استرجاع/, actions: [{ labelKey: 'booking.title', route: '/(customer)/booking' }] },
  { id: 'dispute', pattern: /problem|complain|dispute|bad|broken|not (good|fixed)|مشكلة|شكوى|نزاع/, actions: [{ labelKey: 'booking.title', route: '/(customer)/booking' }] },
  { id: 'payment', pattern: /pay|payment|bank|transfer|receipt|iban|card|دفع|تحويل|ايصال|إيصال|بطاقة|بنك/, actions: [{ labelKey: 'booking.title', route: '/(customer)/booking' }] },
  { id: 'lock', pattern: /chat|call|phone|contact|lock|message|محادثة|اتصال|تواصل|مقفل|رسالة/ },
  { id: 'track', pattern: /track|where|status|progress|arriv|eta|تتبع|وين|أين|حالة|وصل/, actions: [{ labelKey: 'booking.title', route: '/(customer)/booking' }] },
  { id: 'proposals', pattern: /proposal|offer|bid|quote|choose|select|compare|عرض|عروض|اختيار|مقارنة/ },
  { id: 'prices', pattern: /price|cost|how much|cheap|expensive|budget|سعر|أسعار|اسعار|تكلفة|كم|ميزانية/, actions: [{ labelKey: 'search.title', route: '/(customer)/search' }] },
  { id: 'book', pattern: /book|request|order|need|service|schedule|appointment|احجز|حجز|طلب|خدمة|موعد/, actions: [{ labelKey: 'workflow.requestService', route: '/(customer)/booking/create' }] },
  { id: 'rate', pattern: /rate|rating|review|star|feedback|تقييم|مراجعة|نجوم/ },
  { id: 'providers', pattern: /provider|technician|worker|professional|verified|trust|safe|مزود|فني|عامل|موثوق|آمن|امان/, actions: [{ labelKey: 'search.title', route: '/(customer)/search' }] },
  { id: 'wallet', pattern: /wallet|balance|withdraw|محفظة|رصيد|سحب/, actions: [{ labelKey: 'customerProfile.wallet', route: '/(customer)/wallet' }] },
  { id: 'language', pattern: /language|arabic|english|لغة|اللغة|عربي|انجليزي/, actions: [{ labelKey: 'profile.title', route: '/(customer)/profile' }] },
  { id: 'support', pattern: /support|help|contact us|human|agent|دعم|مساعدة|تواصل معكم|خدمة العملاء/, actions: [{ labelKey: 'profile.help', route: '/(customer)/profile' }] },
];

const QUICK_TOPICS = ['book', 'proposals', 'payment', 'track', 'cancel', 'support'];

export default function AssistantScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const flip = useFlipStyle();
  const firstName = user?.name?.split(' ')[0] || '';
  const flatListRef = useRef<FlatList>(null);

  const answer = (topicId: string): Message => {
    const topic = TOPICS.find((x) => x.id === topicId);
    return {
      id: `${Date.now()}-${Math.random()}`,
      text: t(`assistant.answers.${topicId}`, { name: firstName ? ` ${firstName}` : '' }),
      isAi: true,
      time: new Date(),
      actions: topic?.actions?.map((a) => ({ label: t(a.labelKey), route: a.route })),
    };
  };

  const [messages, setMessages] = useState<Message[]>(() => [{ ...answer('welcome'), id: 'welcome' }]);
  const [inputText, setInputText] = useState('');

  // Keep the welcome message in the current language.
  useEffect(() => {
    setMessages((prev) => (prev.length === 1 ? [{ ...answer('welcome'), id: 'welcome' }] : prev));
  }, [i18n.language, firstName]);

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const ask = (text: string, topicId?: string) => {
    const question = text.trim();
    if (!question) return;
    const normalized = question.toLowerCase();
    const topic = topicId || TOPICS.find((x) => x.pattern.test(normalized))?.id || 'fallback';
    setMessages((prev) => [...prev, { id: `${Date.now()}`, text: question, isAi: false, time: new Date() }, answer(topic)]);
    setInputText('');
  };

  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';

  const renderMessage = ({ item }: { item: Message }) => {
    const parts = item.text.split(/\*\*(.*?)\*\*/g);
    return (
      <View style={[styles.msgRow, !item.isAi && styles.msgRowMe]}>
        {item.isAi && (
          <LinearGradient colors={['#2E8B57', '#1A5C38']} style={styles.aiAvatar}>
            <Ionicons name="help-buoy" size={16} color="#fff" />
          </LinearGradient>
        )}
        <View style={[styles.bubble, item.isAi ? styles.bubbleAi : styles.bubbleMe]}>
          <Text style={[styles.msgText, !item.isAi && styles.msgTextMe]}>
            {parts.map((part, i) => (i % 2 === 1 ? <Text key={i} style={{ fontWeight: '800' }}>{part}</Text> : <Text key={i}>{part}</Text>))}
          </Text>
          {!!item.actions?.length && (
            <View style={styles.actionsRow}>
              {item.actions.map((action) => (
                <TouchableOpacity key={action.label} style={styles.actionChip} onPress={() => router.push(action.route)}>
                  <Text style={styles.actionChipText}>{action.label}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#2E8B57" style={flip} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={[styles.msgTime, !item.isAi && styles.msgTimeMe]}>{item.time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.header}>
        <View style={styles.headerAvatar}>
          <Ionicons name="help-buoy" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('assistant.title')}</Text>
          <Text style={styles.headerSub}>{t('assistant.subtitle')}</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList ref={flatListRef} data={messages} keyExtractor={(item) => item.id} renderItem={renderMessage} contentContainerStyle={styles.chatContainer} showsVerticalScrollIndicator={false} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickReplies} style={{ flexGrow: 0 }}>
          {QUICK_TOPICS.map((id) => (
            <TouchableOpacity key={id} style={styles.quickReply} onPress={() => ask(t(`assistant.quick.${id}`), id)}>
              <Text style={styles.quickReplyText}>{t(`assistant.quick.${id}`)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('assistant.placeholder')}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={500}
            onSubmitEditing={() => ask(inputText)}
          />
          <TouchableOpacity style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]} onPress={() => ask(inputText)} disabled={!inputText.trim()} accessibilityLabel={t('chat.send')}>
            <Ionicons name="send" size={20} color="#fff" style={flip} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'android' ? 40 : 12, paddingBottom: 16, paddingHorizontal: 16, gap: 12 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2E8B57', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'left' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginTop: 2, textAlign: 'left' },
  chatContainer: { padding: 16, paddingBottom: 12 },
  msgRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end', maxWidth: '88%' },
  msgRowMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  aiAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginEnd: 8 },
  bubble: { padding: 14, borderRadius: 20, maxWidth: '100%' },
  bubbleAi: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: '#1E3A5F', borderBottomRightRadius: 4 },
  msgText: { fontSize: 15, color: '#1E293B', lineHeight: 23, textAlign: 'left' },
  msgTextMe: { color: '#fff' },
  msgTime: { fontSize: 11, color: '#94A3B8', marginTop: 8, alignSelf: 'flex-end' },
  msgTimeMe: { color: 'rgba(255,255,255,0.6)' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  actionChipText: { fontSize: 13, fontWeight: '700', color: '#2E8B57' },
  quickReplies: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  quickReply: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  quickReplyText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: '#1E293B', maxHeight: 100, borderWidth: 1, borderColor: '#E2E8F0', textAlign: 'left' },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#2E8B57', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
});
