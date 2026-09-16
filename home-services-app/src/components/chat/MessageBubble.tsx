import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Clipboard,
  Alert,
  Modal,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage } from '../../store/chatStore';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';

interface MessageBubbleProps {
  message: ChatMessage;
  isSelf: boolean;
  currentUserId: string;
  onImagePress: (url: string) => void;
  onReplyPress: (message: ChatMessage) => void;
  onDeletePress: (messageId: string) => void;
  onReactPress: (messageId: string, emoji: string) => void;
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSelf,
  currentUserId,
  onImagePress,
  onReplyPress,
  onDeletePress,
  onReactPress
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleCopy = () => {
    if (message.text) {
      Clipboard.setString(message.text);
      Alert.alert('Copied', 'Message text copied to clipboard.');
    }
    setShowMenu(false);
  };

  const handleReaction = (emoji: string) => {
    onReactPress(message._id || message.id || '', emoji);
    setShowMenu(false);
  };

  // Render Checkmark status indicator
  const renderStatus = () => {
    if (!isSelf) return null;

    if (message.status === 'sending') {
      return <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />;
    }
    if (message.status === 'failed') {
      return <Ionicons name="alert-circle" size={14} color="#EF4444" style={{ marginLeft: 4 }} />;
    }

    if (message.seen) {
      return <Ionicons name="checkmark-done" size={15} color="#60A5FA" style={{ marginLeft: 4 }} />;
    }
    if (message.delivered) {
      return <Ionicons name="checkmark-done" size={15} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />;
    }
    return <Ionicons name="checkmark" size={15} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />;
  };

  const hasReactions = message.reactions && Object.keys(message.reactions).length > 0;

  return (
    <View style={[styles.wrapper, isSelf ? styles.wrapperSelf : styles.wrapperOther]}>
      <TouchableOpacity
        onLongPress={() => setShowMenu(true)}
        activeOpacity={0.9}
        style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther]}
      >
        {/* Reply Context Header */}
        {message.replyTo && (
          <View style={[styles.replyBox, isSelf ? styles.replyBoxSelf : styles.replyBoxOther]}>
            <Text style={styles.replySender}>{message.replyTo.senderName}</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {message.replyTo.text}
            </Text>
          </View>
        )}

        {/* Image Attachment */}
        {message.image && (
          <TouchableOpacity onPress={() => onImagePress(message.image!)} style={styles.imageBox}>
            <Image source={{ uri: message.image }} style={styles.chatImage} resizeMode="cover" />
          </TouchableOpacity>
        )}

        {/* Voice Note Player */}
        {message.voiceUrl && (
          <VoiceMessagePlayer
            voiceUrl={message.voiceUrl}
            durationSeconds={message.voiceDuration}
            isSelf={isSelf}
          />
        )}

        {/* Document Attachment */}
        {message.documentUrl && (
          <TouchableOpacity style={styles.docBox}>
            <Ionicons name="document-text-outline" size={24} color={isSelf ? '#FFFFFF' : '#2563EB'} />
            <Text style={[styles.docName, isSelf ? styles.textSelf : styles.textOther]} numberOfLines={1}>
              {message.documentName || 'Attachment Document'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Location Attachment Card */}
        {message.location && (
          <View style={styles.locationCard}>
            <Ionicons name="location" size={18} color="#EF4444" />
            <Text style={styles.locationText} numberOfLines={1}>
              {message.location.placeName || 'Shared Location'}
            </Text>
          </View>
        )}

        {/* Text Message */}
        {Boolean(message.text) && (
          <Text style={[styles.msgText, isSelf ? styles.textSelf : styles.textOther]}>
            {message.text}
          </Text>
        )}

        {/* Footer Meta Row (Time + Status) */}
        <View style={styles.metaRow}>
          <Text style={[styles.timeText, isSelf ? styles.timeSelf : styles.timeOther]}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {renderStatus()}
        </View>

        {/* Reactions Pill Overlay */}
        {hasReactions && (
          <View style={[styles.reactionsBar, isSelf ? styles.reactSelf : styles.reactOther]}>
            {Object.entries(message.reactions!).map(([emoji, users]) => (
              <Text key={emoji} style={styles.reactionEmoji}>
                {emoji} {users.length > 1 ? users.length : ''}
              </Text>
            ))}
          </View>
        )}
      </TouchableOpacity>

      {/* Long-Press Action Modal Menu */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            {/* Reactions Picker */}
            <View style={styles.reactionPicker}>
              {EMOJI_OPTIONS.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => handleReaction(emoji)} style={styles.emojiItem}>
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.menuList}>
              <TouchableOpacity
                style={styles.menuOption}
                onPress={() => {
                  setShowMenu(false);
                  onReplyPress(message);
                }}
              >
                <Ionicons name="arrow-undo-outline" size={18} color="#0F172A" />
                <Text style={styles.menuOptionText}>Reply</Text>
              </TouchableOpacity>

              {Boolean(message.text) && (
                <TouchableOpacity style={styles.menuOption} onPress={handleCopy}>
                  <Ionicons name="copy-outline" size={18} color="#0F172A" />
                  <Text style={styles.menuOptionText}>Copy Text</Text>
                </TouchableOpacity>
              )}

              {isSelf && (
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => {
                    setShowMenu(false);
                    onDeletePress(message._id || message.id || '');
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={[styles.menuOptionText, { color: '#EF4444' }]}>Delete for Everyone</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginVertical: 4, flexDirection: 'row', width: '100%' },
  wrapperSelf: { justifyContent: 'flex-end' },
  wrapperOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 18,
    position: 'relative'
  },
  bubbleSelf: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4
  },
  bubbleOther: {
    backgroundColor: '#F1F5F9',
    borderBottomLeftRadius: 4
  },
  msgText: { fontSize: 15, lineHeight: 21 },
  textSelf: { color: '#FFFFFF' },
  textOther: { color: '#0F172A' },
  replyBox: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 6,
    borderRadius: 4
  },
  replyBoxSelf: { borderLeftColor: '#FFFFFF', backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  replyBoxOther: { borderLeftColor: '#2563EB', backgroundColor: 'rgba(0, 0, 0, 0.04)' },
  replySender: { fontSize: 11, fontWeight: '800', color: '#2563EB' },
  replyText: { fontSize: 12, color: '#64748B', marginTop: 1 },
  imageBox: { borderRadius: 12, overflow: 'hidden', marginBottom: 6, width: 220, height: 180 },
  chatImage: { width: '100%', height: '100%' },
  docBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10 },
  docName: { fontSize: 13, fontWeight: '600', flex: 1 },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#FFFFFF', borderRadius: 10, marginBottom: 6 },
  locationText: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  timeText: { fontSize: 10, fontWeight: '600' },
  timeSelf: { color: 'rgba(255, 255, 255, 0.7)' },
  timeOther: { color: '#94A3B8' },
  reactionsBar: {
    position: 'absolute',
    bottom: -10,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  reactSelf: { right: 10 },
  reactOther: { left: 10 },
  reactionEmoji: { fontSize: 12, marginRight: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { backgroundColor: '#FFFFFF', borderRadius: 20, width: '82%', padding: 16 },
  reactionPicker: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  emojiItem: { padding: 4 },
  menuList: { paddingTop: 8 },
  menuOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  menuOptionText: { fontSize: 15, fontWeight: '700', color: '#0F172A' }
});
