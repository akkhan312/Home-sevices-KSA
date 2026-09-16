import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_HOST } from '../../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface VoiceMessageRecorderProps {
  bookingId: string;
  onVoiceSent: (voiceUrl: string, durationSeconds: number) => void;
}

export const VoiceMessageRecorder: React.FC<VoiceMessageRecorderProps> = ({
  bookingId,
  onVoiceSent
}) => {
  const [recording, setRecording] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [uploading, setUploading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new (window as any).MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event: any) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          if (durationSec >= 1) {
            onVoiceSent(audioUrl, durationSec);
          }
        };

        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
        setDurationSec(0);

        timerRef.current = setInterval(() => {
          setDurationSec((prev) => prev + 1);
        }, 1000);
        return;
      }

      const { Audio } = require('expo-av');
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is required to record voice messages.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setDurationSec(0);

      timerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Start recording error:', err);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    if (Platform.OS === 'web') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri && durationSec >= 1) {
        uploadVoiceMessage(uri, durationSec);
      }
    } catch (err) {
      console.error('Stop recording error:', err);
    }
  };

  const cancelRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setDurationSec(0);

    if (Platform.OS === 'web') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      audioChunksRef.current = [];
      return;
    }

    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {}
      setRecording(null);
    }
  };

  const uploadVoiceMessage = async (uri: string, duration: number) => {
    try {
      setUploading(true);
      const token = await AsyncStorage.getItem('jwt_token');
      const formData = new FormData();
      const filename = `voice_${Date.now()}.m4a`;

      formData.append('file', {
        uri,
        name: filename,
        type: 'audio/m4a'
      } as any);

      const res = await fetch(`${API_HOST}/api/chat/upload-voice?bookingId=${bookingId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
      onVoiceSent(data.url, duration);
    } catch (e: any) {
      // A local file path is not playable on the other device, so never send it as the message.
      Alert.alert('Voice message not sent', e?.message || 'Please check your connection and try again.');
    } finally {
      setUploading(false);
      setDurationSec(0);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  if (uploading) {
    return (
      <View style={styles.recordingRow}>
        <ActivityIndicator color="#2563EB" size="small" />
        <Text style={styles.sendingText}>Sending voice note...</Text>
      </View>
    );
  }

  if (isRecording) {
    return (
      <View style={styles.recordingRow}>
        <View style={styles.recordingDot} />
        <Text style={styles.timerText}>{formatTime(durationSec)}</Text>
        <Text style={styles.slideCancelText}>Release to send</Text>

        <TouchableOpacity style={styles.cancelBtn} onPress={cancelRecording}>
          <Ionicons name="trash" size={20} color="#EF4444" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.sendMicBtn} onPress={stopRecording}>
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.micBtn}
      onPressIn={startRecording}
      onPressOut={stopRecording}
    >
      <Ionicons name="mic" size={22} color="#64748B" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  micBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', marginRight: 8 },
  timerText: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginRight: 12 },
  slideCancelText: { flex: 1, fontSize: 12, color: '#64748B' },
  cancelBtn: { padding: 6, marginRight: 8 },
  sendMicBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  sendingText: { fontSize: 13, color: '#64748B', marginLeft: 8, fontWeight: '600' }
});
