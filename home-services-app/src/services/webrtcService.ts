import { Socket } from 'socket.io-client';
import { Platform } from 'react-native';

export interface CallSession {
  bookingId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  targetUserId?: string;
  serviceName?: string;
  status: 'idle' | 'outgoing' | 'incoming' | 'connected' | 'ended' | 'rejected' | 'busy' | 'timeout';
  duration: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  quality: 'good' | 'fair' | 'poor';
}

class WebRTCManager {
  private socket: Socket | null = null;
  private peerConnection: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private callTimer: any = null;
  private durationCounter: any = null;
  private ringtoneSound: any = null;
  private ringtoneInterval: any = null;
  private currentSession: CallSession | null = null;
  private mediaRecorder: any = null;

  private onSessionUpdateCallbacks: ((session: CallSession | null) => void)[] = [];

  public init(socketInstance: Socket) {
    this.socket = socketInstance;
    this.setupSocketListeners();
  }

  public subscribeSession(callback: (session: CallSession | null) => void) {
    this.onSessionUpdateCallbacks.push(callback);
    callback(this.currentSession);
    return () => {
      this.onSessionUpdateCallbacks = this.onSessionUpdateCallbacks.filter((c) => c !== callback);
    };
  }

  private updateSession(updates: Partial<CallSession> | null) {
    if (updates === null) {
      this.currentSession = null;
    } else if (this.currentSession) {
      this.currentSession = { ...this.currentSession, ...updates };
    }
    this.onSessionUpdateCallbacks.forEach((cb) => cb(this.currentSession));
  }

  // Universal Mobile & Web Ringtone Player
  private async playRingtone() {
    await this.stopRingtone();
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.ringtoneInterval = setInterval(() => {
          try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 1.4);
          } catch (e) {}
        }, 2200);
      } else {
        // Expo Native Mobile Ringtone (iOS & Android) - Single Looping Sound
        const { Audio } = require('expo-av');
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
            { shouldPlay: true, isLooping: true }
          );
          this.ringtoneSound = sound;
        } catch (e) {}
      }
    } catch (e) {}
  }

  private async stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.ringtoneSound) {
      const soundObj = this.ringtoneSound;
      this.ringtoneSound = null;
      try {
        await soundObj.stopAsync().catch(() => {});
        await soundObj.unloadAsync().catch(() => {});
      } catch (e) {}
    }
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('incoming_call', (data) => {
      if (this.currentSession && this.currentSession.status === 'connected') {
        this.socket?.emit('call_busy', { bookingId: data.bookingId, targetUserId: data.callerId });
        return;
      }

      this.currentSession = {
        bookingId: data.bookingId,
        callerId: data.callerId,
        callerName: data.callerName || 'Incoming Call',
        callerAvatar: data.callerAvatar,
        serviceName: data.serviceName || 'Home Service',
        status: 'incoming',
        duration: 0,
        isMuted: false,
        isSpeakerOn: false,
        quality: 'good'
      };
      this.updateSession(this.currentSession);
      this.playRingtone();

      if (this.callTimer) clearTimeout(this.callTimer);
      this.callTimer = setTimeout(() => {
        if (this.currentSession && this.currentSession.status === 'incoming') {
          this.endCall('timeout');
        }
      }, 30000);
    });

    this.socket.on('call_accepted', async (data) => {
      this.stopRingtone();
      if (this.callTimer) clearTimeout(this.callTimer);
      this.startDurationCounter();
      this.updateSession({ status: 'connected' });
      await this.initiateAudioStream(false);
    });

    this.socket.on('webrtc_offer', async (data) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const pc = this.getPeerConnection();
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.socket?.emit('webrtc_answer', { bookingId: data.bookingId, answer });
        } catch (e) {}
      }
    });

    this.socket.on('webrtc_answer', async (data) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const pc = this.getPeerConnection();
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {}
      }
    });

    this.socket.on('ice_candidate', async (data) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const pc = this.getPeerConnection();
          if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        } catch (e) {}
      }
    });

    this.socket.on('voice_stream_chunk', (data) => {
      // Play incoming voice stream audio chunk from peer
      if (data.chunk && this.currentSession && this.currentSession.status === 'connected') {
        try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const audio = new window.Audio(data.chunk);
            audio.play().catch(() => {});
          } else {
            const { Audio } = require('expo-av');
            Audio.Sound.createAsync({ uri: data.chunk }, { shouldPlay: true });
          }
        } catch (e) {}
      }
    });

    this.socket.on('call_rejected', (data) => {
      this.stopRingtone();
      if (this.callTimer) clearTimeout(this.callTimer);
      this.updateSession({ status: 'rejected' });
      setTimeout(() => this.resetCall(), 2500);
    });

    this.socket.on('call_cancelled', () => {
      this.stopRingtone();
      if (this.callTimer) clearTimeout(this.callTimer);
      this.updateSession({ status: 'ended' });
      setTimeout(() => this.resetCall(), 1500);
    });

    this.socket.on('call_busy', () => {
      this.stopRingtone();
      this.updateSession({ status: 'busy' });
      setTimeout(() => this.resetCall(), 2500);
    });

    const onCallFailed = (data: any) => {
      this.stopRingtone();
      if (this.callTimer) clearTimeout(this.callTimer);
      this.updateSession({ status: 'rejected' });
      if (data?.error) {
        const { Alert } = require('react-native');
        Alert.alert('📞', data.error);
      }
      setTimeout(() => this.resetCall(), 1500);
    };
    this.socket.on('call_failed', onCallFailed);
    this.socket.on('call_offline', () => onCallFailed({ error: 'The other person is offline right now. Please try again later.' }));

    this.socket.on('call_timeout', () => {
      this.stopRingtone();
      this.updateSession({ status: 'timeout' });
      setTimeout(() => this.resetCall(), 2500);
    });

    this.socket.on('call_ended', () => {
      this.stopRingtone();
      this.stopDurationCounter();
      this.updateSession({ status: 'ended' });
      setTimeout(() => this.resetCall(), 1500);
    });
  }

  private getPeerConnection() {
    if (!this.peerConnection && Platform.OS === 'web' && typeof window !== 'undefined') {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && this.currentSession) {
          this.socket?.emit('ice_candidate', {
            bookingId: this.currentSession.bookingId,
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          const audioElement = document.createElement('audio');
          audioElement.srcObject = event.streams[0];
          audioElement.autoplay = true;
        }
      };

      this.peerConnection = pc;
    }
    return this.peerConnection;
  }

  private async initiateAudioStream(isOffer: boolean) {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.localStream = stream;
        const pc = this.getPeerConnection();

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        if (isOffer) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.socket?.emit('webrtc_offer', {
            bookingId: this.currentSession?.bookingId,
            offer
          });
        }

        // Live Mic Recording Chunk Relay for Web
        const mediaRecorder = new (window as any).MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e: any) => {
          if (e.data.size > 0 && this.currentSession && this.currentSession.status === 'connected') {
            const reader = new FileReader();
            reader.readAsDataURL(e.data);
            reader.onloadend = () => {
              this.socket?.emit('voice_stream_chunk', {
                bookingId: this.currentSession?.bookingId,
                chunk: reader.result
              });
            };
          }
        };
        mediaRecorder.start(1000);
        this.mediaRecorder = mediaRecorder;
      }
    } catch (e) {
      console.warn('Audio stream access error:', e);
    }
  }

  public startCall({
    bookingId,
    callerName,
    callerAvatar,
    targetUserId,
    serviceName
  }: {
    bookingId: string;
    callerName: string;
    callerAvatar?: string;
    targetUserId?: string;
    serviceName?: string;
  }) {
    this.currentSession = {
      bookingId,
      callerId: 'me',
      callerName,
      callerAvatar,
      targetUserId,
      serviceName: serviceName || 'Home Service',
      status: 'outgoing',
      duration: 0,
      isMuted: false,
      isSpeakerOn: false,
      quality: 'good'
    };
    this.updateSession(this.currentSession);
    this.playRingtone();

    this.socket?.emit('call_user', {
      bookingId,
      callerName,
      callerAvatar,
      targetUserId,
      serviceName
    });

    if (this.callTimer) clearTimeout(this.callTimer);
    this.callTimer = setTimeout(() => {
      if (this.currentSession && this.currentSession.status === 'outgoing') {
        this.socket?.emit('call_timeout', { bookingId });
        this.updateSession({ status: 'timeout' });
        setTimeout(() => this.resetCall(), 2500);
      }
    }, 30000);
  }

  public async acceptCall() {
    if (!this.currentSession || !this.socket) return;
    this.stopRingtone();
    if (this.callTimer) clearTimeout(this.callTimer);

    this.socket.emit('call_accepted', { bookingId: this.currentSession.bookingId });
    this.startDurationCounter();
    this.updateSession({ status: 'connected' });
    await this.initiateAudioStream(true);
  }

  public rejectCall() {
    if (!this.currentSession || !this.socket) return;
    this.stopRingtone();
    if (this.callTimer) clearTimeout(this.callTimer);

    this.socket.emit('call_rejected', { bookingId: this.currentSession.bookingId, reason: 'user_declined' });
    this.updateSession({ status: 'rejected' });
    setTimeout(() => this.resetCall(), 1000);
  }

  public endCall(reason: string = 'user_ended') {
    if (!this.currentSession || !this.socket) return;
    this.stopRingtone();
    if (this.callTimer) clearTimeout(this.callTimer);
    this.stopDurationCounter();

    const duration = this.currentSession.duration;
    this.socket.emit('call_ended', { bookingId: this.currentSession.bookingId, duration });
    this.updateSession({ status: 'ended' });
    setTimeout(() => this.resetCall(), 1200);
  }

  public toggleMute() {
    if (this.currentSession) {
      const isMuted = !this.currentSession.isMuted;
      this.updateSession({ isMuted });
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track: any) => {
          track.enabled = !isMuted;
        });
      }
    }
  }

  public toggleSpeaker() {
    if (this.currentSession) {
      this.updateSession({ isSpeakerOn: !this.currentSession.isSpeakerOn });
    }
  }

  private startDurationCounter() {
    this.stopDurationCounter();
    this.durationCounter = setInterval(() => {
      if (this.currentSession && this.currentSession.status === 'connected') {
        this.updateSession({ duration: this.currentSession.duration + 1 });
      }
    }, 1000);
  }

  private stopDurationCounter() {
    if (this.durationCounter) {
      clearInterval(this.durationCounter);
      this.durationCounter = null;
    }
  }

  private resetCall() {
    this.stopRingtone();
    this.stopDurationCounter();
    if (this.callTimer) clearTimeout(this.callTimer);
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
      this.mediaRecorder = null;
    }
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((track: any) => track.stop());
      } catch (e) {}
      this.localStream = null;
    }
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }
    this.currentSession = null;
    this.updateSession(null);
  }
}

export const webrtcManager = new WebRTCManager();
