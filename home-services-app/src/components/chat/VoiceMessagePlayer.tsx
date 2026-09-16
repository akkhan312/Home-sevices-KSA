import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface VoiceMessagePlayerProps {
  voiceUrl: string;
  durationSeconds?: number;
  isSelf: boolean;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  voiceUrl,
  durationSeconds = 0,
  isSelf
}) => {
  const [sound, setSound] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(durationSeconds * 1000);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (sound && sound.unloadAsync) {
        sound.unloadAsync();
      }
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
    };
  }, [sound]);

  const loadSound = async () => {
    try {
      setLoading(true);
      if (Platform.OS === 'web') {
        if (!webAudioRef.current) {
          const audio = new window.Audio(voiceUrl);
          audio.playbackRate = playbackSpeed;
          audio.onended = () => {
            setIsPlaying(false);
            setPositionMillis(0);
          };
          audio.ontimeupdate = () => {
            setPositionMillis(audio.currentTime * 1000);
            if (audio.duration) setDurationMillis(audio.duration * 1000);
          };
          webAudioRef.current = audio;
        }
        await webAudioRef.current.play();
        setIsPlaying(true);
      } else {
        const { Audio } = require('expo-av');
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: voiceUrl },
          { shouldPlay: true, rate: playbackSpeed },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (e) {
      console.error('Play audio error:', e);
    } finally {
      setLoading(false);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPositionMillis(status.positionMillis || 0);
      setDurationMillis(status.durationMillis || durationSeconds * 1000);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPositionMillis(0);
      }
    }
  };

  const togglePlayPause = async () => {
    if (Platform.OS === 'web') {
      if (!webAudioRef.current) {
        await loadSound();
      } else {
        if (isPlaying) {
          webAudioRef.current.pause();
          setIsPlaying(false);
        } else {
          await webAudioRef.current.play();
          setIsPlaying(true);
        }
      }
      return;
    }

    if (!sound) {
      await loadSound();
    } else {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        if (positionMillis >= durationMillis) {
          await sound.replayAsync();
        } else {
          await sound.playAsync();
        }
      }
    }
  };

  const toggleSpeed = async () => {
    const nextSpeed = playbackSpeed === 1.0 ? 1.5 : playbackSpeed === 1.5 ? 2.0 : 1.0;
    setPlaybackSpeed(nextSpeed);
    if (Platform.OS === 'web' && webAudioRef.current) {
      webAudioRef.current.playbackRate = nextSpeed;
    } else if (sound) {
      await sound.setRateAsync(nextSpeed, true);
    }
  };

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPct = durationMillis > 0 ? (positionMillis / durationMillis) * 100 : 0;

  return (
    <View style={[styles.container, isSelf ? styles.containerSelf : styles.containerOther]}>
      <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={isSelf ? '#FFFFFF' : '#2563EB'} size="small" />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={20}
            color={isSelf ? '#FFFFFF' : '#2563EB'}
          />
        )}
      </TouchableOpacity>

      <View style={styles.waveformCol}>
        <View style={styles.trackBackground}>
          <View
            style={[
              styles.trackProgress,
              { width: `${Math.min(100, Math.max(0, progressPct))}%` },
              isSelf ? styles.progressSelf : styles.progressOther
            ]}
          />
        </View>
        <Text style={[styles.timeText, isSelf ? styles.textSelf : styles.textOther]}>
          {isPlaying ? formatTime(positionMillis) : formatTime(durationMillis)}
        </Text>
      </View>

      <TouchableOpacity style={styles.speedBtn} onPress={toggleSpeed}>
        <Text style={[styles.speedText, isSelf ? styles.textSelf : styles.textOther]}>
          {playbackSpeed.toFixed(1)}x
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 16,
    minWidth: 210,
    marginVertical: 4
  },
  containerSelf: { backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  containerOther: { backgroundColor: 'rgba(0, 0, 0, 0.05)' },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  waveformCol: { flex: 1, justifyContent: 'center' },
  trackBackground: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden'
  },
  trackProgress: { height: '100%', borderRadius: 2 },
  progressSelf: { backgroundColor: '#FFFFFF' },
  progressOther: { backgroundColor: '#2563EB' },
  timeText: { fontSize: 10, fontWeight: '700', marginTop: 4 },
  speedBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 8
  },
  speedText: { fontSize: 10, fontWeight: '800' },
  textSelf: { color: '#FFFFFF' },
  textOther: { color: '#475569' }
});
