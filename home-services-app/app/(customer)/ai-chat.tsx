import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Animated, Linking
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { LinearGradient } from 'expo-linear-gradient';

interface Message {
  id: string;
  text: string;
  isAi: boolean;
  time: Date;
  actions?: { label: string; onPress: () => void }[];
}

const QUICK_REPLIES = [
  { text: '🏠 Book a service', query: 'How do I book a service?' },
  { text: '📋 Track my order', query: 'How do I track my booking?' },
  { text: '💳 Payment help', query: 'What payment methods do you accept?' },
  { text: '❌ Cancel booking', query: 'How do I cancel a booking?' },
  { text: '⭐ Ratings', query: 'How does the rating system work?' },
  { text: '📞 Contact support', query: 'How do I contact customer support?' },
];

// Comprehensive AI response engine
function generateResponse(userText: string, userName: string): { text: string; actions?: { label: string; route: any }[] } {
  const text = userText.toLowerCase().trim();

  // Greetings
  if (/^(hi|hello|hey|salam|مرحبا|السلام|ahlan|ahlan wa sahlan|howdy|good|morning|afternoon|evening)/.test(text)) {
    return {
      text: `Hello ${userName}! 👋 Welcome to ServeHome AI Assistant. I'm here to help you with:\n\n• Booking home services\n• Tracking your orders\n• Payment & wallet help\n• App navigation\n• General questions\n\nWhat can I help you with today?`,
    };
  }

  // Booking
  if (/book|booking|schedule|appointment|order|reserve|هجز|حجز/.test(text)) {
    return {
      text: `📅 **Booking a Service**\n\n1. Tap **Home** on the bottom tab\n2. Select your service category (Cleaning, Plumbing, AC, etc.)\n3. Choose a service type and price\n4. Pick a date and time slot\n5. Enter your address\n6. Confirm your booking!\n\nA provider will accept your request shortly. You'll get notified when they do.`,
      actions: [{ label: '📋 Go to Home', route: '/(customer)/index' }],
    };
  }

  // Cleaning
  if (/clean|cleaning|maid|house|sweep|vacuum|تنظيف/.test(text)) {
    return {
      text: `🧹 **Cleaning Services**\n\nWe offer professional cleaning starting from **SAR 80**:\n\n• Studio / 1BR — SAR 80\n• 2BR Apartment — SAR 120\n• 3BR Apartment — SAR 160\n• Villa — SAR 250\n\nAll cleaners are background-checked and verified. Book now!`,
      actions: [{ label: '🧹 Book Cleaning', route: '/(customer)/index' }],
    };
  }

  // Plumbing
  if (/plumb|pipe|leak|water|faucet|drain|sink|سباكة/.test(text)) {
    return {
      text: `🔧 **Plumbing Services**\n\nAvailable plumbing services starting at **SAR 100**:\n\n• Pipe Repair — SAR 100\n• Leak Fix — SAR 120\n• Pipe Installation — SAR 180\n\nAll our plumbers are licensed professionals.`,
      actions: [{ label: '🔧 Book Plumber', route: '/(customer)/index' }],
    };
  }

  // Electrical
  if (/electric|wiring|light|switch|socket|circuit|power|breaker|كهرباء/.test(text)) {
    return {
      text: `⚡ **Electrical Services**\n\nCertified electricians available:\n\n• Switch / Socket — SAR 80\n• Wiring Work — SAR 200\n• Circuit Breaker — SAR 150\n\n⚠️ Always hire certified professionals for electrical work. Safety first!`,
    };
  }

  // AC
  if (/ac|air.*condition|conditioning|cool|تكييف|باردة/.test(text)) {
    return {
      text: `❄️ **AC Repair & Maintenance**\n\nKeep your home cool:\n\n• Service & Clean — SAR 150\n• Gas Refill — SAR 200\n• Full Repair — SAR 350\n\nWe recommend servicing your AC every 3-6 months for optimal performance.`,
    };
  }

  // Painting
  if (/paint|painting|wall|color|دهانات/.test(text)) {
    return {
      text: `🎨 **Painting Services**\n\nFresh colors for your home:\n\n• One Room — SAR 200\n• Full Apartment — SAR 600\n• Villa — SAR 1,200\n\nIncludes premium paint and cleanup!`,
    };
  }

  // Payment
  if (/pay|payment|price|cost|charge|fee|card|visa|mastercard|paypal|apple.*pay|google.*pay|cash|wallet|دفع|سعر/.test(text)) {
    return {
      text: `💳 **Payment Methods**\n\nWe accept:\n\n✅ **Credit/Debit Cards** — Visa, Mastercard, Mada\n✅ **Apple Pay / Google Pay**\n✅ **PayPal**\n✅ **Bank Transfer** (Al Rajhi Bank)\n✅ **Cash on Delivery**\n\nAll payments are secured with 256-bit SSL encryption 🔒`,
      actions: [{ label: '💼 Open Wallet', route: '/(customer)/wallet' }],
    };
  }

  // Tracking / status
  if (/track|status|where|progress|update|order.*status|follow/.test(text)) {
    return {
      text: `📍 **Track Your Order**\n\nGo to the **Bookings** tab to see all your orders. You can track:\n\n• ⏳ **Pending** — Awaiting provider\n• ✅ **Accepted** — Provider confirmed\n• 🔨 **In Progress** — Job underway\n• 🎉 **Completed** — All done!\n\nYou can also chat with your provider once they accept!`,
      actions: [{ label: '📋 My Bookings', route: '/(customer)/booking' }],
    };
  }

  // Cancel / refund
  if (/cancel|refund|money.*back|return|إلغاء/.test(text)) {
    return {
      text: `❌ **Cancellation Policy**\n\nYou can cancel bookings from the **Bookings** tab before the provider accepts.\n\n• **Free cancellation** — Before provider accepts\n• **Partial refund** — Cancelled 24h before service\n• **No refund** — Cancelled less than 2h before\n\nFor disputes, contact our support team.`,
      actions: [{ label: '📋 My Bookings', route: '/(customer)/booking' }],
    };
  }

  // Rating / review
  if (/rate|rating|review|star|feedback|تقييم/.test(text)) {
    return {
      text: `⭐ **Rating System**\n\nAfter each completed service:\n\n1. Go to your **Booking Details**\n2. Tap "Leave a Review"\n3. Rate 1-5 stars and add comments\n\nYour feedback helps maintain quality and rewards great providers!`,
    };
  }

  // Live location
  if (/location|share.*location|live.*location|where.*am|map/.test(text)) {
    return {
      text: `📍 **Live Location Sharing in Chat**\n\nIn your chat with a provider, tap the 📍 button to:\n\n• **Share current location** — One-time\n• **Live Location 1 hour** — Updates every 30s\n• **Live Location 2 hours** — For longer jobs\n• **Live Location 8 hours** — Full day coverage\n\nThe provider sees your live position on a map!`,
    };
  }

  // Language
  if (/language|arabic|english|عربي|لغة|اللغة/.test(text)) {
    return {
      text: `🌐 **Language Settings**\n\nYou can switch between English and Arabic:\n\n• Tap the **EN/AR toggle** above the bottom tab bar anytime\n• Or go to **Profile → Language** to switch\n\nThe app supports full RTL for Arabic!`,
    };
  }

  // Provider / professional
  if (/provider|professional|worker|technician|who|find.*pro|مزود|عامل/.test(text)) {
    return {
      text: `👷 **Our Providers**\n\nAll ServeHome providers are:\n\n✅ Background-checked\n✅ Identity verified\n✅ Skills assessed\n✅ Rated by real customers\n\nWe only work with the top-rated professionals in your city!`,
    };
  }

  // App questions
  if (/app|work|how.*app|get.*started|start|use/.test(text)) {
    return {
      text: `📱 **How ServeHome Works**\n\n1. 🔍 **Browse** services on the Home screen\n2. 📅 **Book** by selecting date, time & address\n3. 👷 **Provider accepts** and heads your way\n4. 💬 **Chat** with provider in real-time\n5. 💳 **Pay** securely after job completion\n6. ⭐ **Rate** your experience\n\nSimple as that!`,
    };
  }

  // Support
  if (/support|help|contact|complaint|issue|problem|خدمة|مساعدة/.test(text)) {
    return {
      text: `📞 **Customer Support**\n\nWe're here to help!\n\n• 💬 **AI Chat** — Available 24/7 (that's me!)\n• 📧 **Email** — servehomeinfo@gmail.com\n• 📱 **Phone / WhatsApp** — +966 50 944 9238\n\nSupport hours: Saturday–Thursday, 8AM–10PM (KSA)`,
    };
  }

  // Weather question (general)
  if (/weather|temperature|hot|cold|طقس/.test(text)) {
    return {
      text: `🌤️ I'm a home services AI, but I can tell you that the weather definitely affects when you might need our services!\n\nHot weather? Book **AC Maintenance**.\nRainy season? Book **Leak & Plumbing** checks.\n\nWould you like to book a service?`,
    };
  }

  // Pricing general
  if (/price.*list|services.*price|how.*much|cost.*clean|rate.*service/.test(text)) {
    return {
      text: `💰 **Service Price List**\n\n🧹 Cleaning — SAR 80–250\n🔧 Plumbing — SAR 100–180\n❄️ AC Repair — SAR 150–350\n⚡ Electrical — SAR 80–200\n🎨 Painting — SAR 200–1,200\n🔨 Maintenance — SAR 90–250\n\nPrices may vary by provider. Final price is shown before booking!`,
    };
  }

  // Wallet
  if (/wallet|balance|money|fund|top.*up|recharge|محفظة/.test(text)) {
    return {
      text: `💼 **Your Wallet**\n\nThe wallet lets you:\n\n• Store credit for quick payments\n• Top up via Card, PayPal, or Bank Transfer\n• View transaction history\n• Transfer funds\n\nGo to the **Wallet** tab (💼) to manage your balance!`,
      actions: [{ label: '💼 Open Wallet', route: '/(customer)/wallet' }],
    };
  }

  // Fallback — still helpful
  return {
    text: `🤔 I'm not sure I fully understood that, but I'm always learning!\n\nI can help you with:\n\n• 🏠 Booking home services\n• 📋 Tracking orders\n• 💳 Payment & wallet\n• 📍 Live location in chat\n• ❓ General questions\n\nCould you rephrase or tap one of the quick replies below?`,
  };
}

export default function AiChatScreen() {
  const { user } = useAuthStore();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: `Hello ${firstName}! 👋 I'm the **ServeHome AI Assistant**.\n\nI can answer any question about home services, bookings, payments, or general help. What can I help you with today?`,
      isAi: true,
      time: new Date(),
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const sendMessage = (overrideText?: string) => {
    const msgText = (overrideText || inputText).trim();
    if (!msgText) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: msgText,
      isAi: false,
      time: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    const delay = 800 + Math.random() * 700;
    setTimeout(() => {
      const response = generateResponse(msgText, firstName);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        isAi: true,
        time: new Date(),
        actions: response.actions?.map(a => ({
          label: a.label,
          onPress: () => router.push(a.route as any),
        })),
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, delay);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    // Parse **bold** text
    const renderBoldText = (text: string) => {
      const parts = text.split(/\*\*(.*?)\*\*/g);
      return parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontWeight: '800' }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      );
    };

    return (
      <View style={[styles.msgRow, !item.isAi && styles.msgRowMe]}>
        {item.isAi && (
          <LinearGradient colors={['#2E8B57', '#1A5C38']} style={styles.aiAvatar}>
            <Ionicons name="hardware-chip" size={16} color="#fff" />
          </LinearGradient>
        )}
        <View style={[styles.bubble, item.isAi ? styles.bubbleAi : styles.bubbleMe]}>
          <Text style={[styles.msgText, !item.isAi && styles.msgTextMe]}>
            {renderBoldText(item.text)}
          </Text>

          {item.actions && item.actions.length > 0 && (
            <View style={styles.actionsRow}>
              {item.actions.map((action, i) => (
                <TouchableOpacity key={i} style={styles.actionChip} onPress={action.onPress}>
                  <Text style={styles.actionChipText}>{action.label}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#2E8B57" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.msgTime, !item.isAi && styles.msgTimeMe]}>
            {item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatarGrad}>
            <Ionicons name="hardware-chip" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Always Online · Powered by AI</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.chatContainer}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingRow}>
                <LinearGradient colors={['#2E8B57', '#1A5C38']} style={styles.aiAvatarSm}>
                  <Ionicons name="hardware-chip" size={12} color="#fff" />
                </LinearGradient>
                <View style={styles.typingBubble}>
                  <ActivityIndicator size="small" color="#2E8B57" />
                  <Text style={styles.typingText}>Thinking...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Quick replies */}
        {messages.length <= 1 && !isTyping && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickReplies}
          >
            {QUICK_REPLIES.map((qr, i) => (
              <TouchableOpacity
                key={i}
                style={styles.quickReply}
                onPress={() => sendMessage(qr.query)}
              >
                <Text style={styles.quickReplyText}>{qr.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask me anything..."
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isTyping) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!inputText.trim() || isTyping}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerAvatarGrad: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2E8B57',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  onlineText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  chatContainer: { padding: 16, paddingBottom: 12 },
  msgRow: {
    flexDirection: 'row', marginBottom: 16,
    alignItems: 'flex-end', maxWidth: '88%',
  },
  msgRowMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  aiAvatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  aiAvatarSm: {
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  bubble: { padding: 14, borderRadius: 20, maxWidth: '100%' },
  bubbleAi: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bubbleMe: { backgroundColor: '#1E3A5F', borderBottomRightRadius: 4 },
  msgText: { fontSize: 15, color: '#1E293B', lineHeight: 23 },
  msgTextMe: { color: '#fff' },
  msgTime: { fontSize: 11, color: '#94A3B8', marginTop: 8, alignSelf: 'flex-end' },
  msgTimeMe: { color: 'rgba(255,255,255,0.6)' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1, borderColor: '#BBF7D0',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
  },
  actionChipText: { fontSize: 13, fontWeight: '700', color: '#2E8B57' },
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', padding: 12, borderRadius: 16,
    borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  typingText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  quickReplies: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  quickReply: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  quickReplyText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  inputContainer: {
    flexDirection: 'row', padding: 12, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E2E8F0', alignItems: 'flex-end', gap: 10,
  },
  input: {
    flex: 1, backgroundColor: '#F1F5F9',
    borderRadius: 24, paddingHorizontal: 20,
    paddingTop: 12, paddingBottom: 12,
    fontSize: 15, color: '#1E293B', maxHeight: 100,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2E8B57',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2E8B57', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0 },
});
