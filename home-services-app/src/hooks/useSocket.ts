import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_HOST } from '../config/api';

let socketInstance: Socket | null = null;
let connectionCount = 0;

export function useSocket() {
  const [connected, setConnected] = useState<boolean>(Boolean(socketInstance?.connected));
  const listenersRef = useRef<Map<string, Set<Function>>>(new Map());

  const getToken = async () => {
    try {
      return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
    } catch {
      return null;
    }
  };

  const getSocket = useCallback(async (): Promise<Socket | null> => {
    if (socketInstance && socketInstance.connected) {
      return socketInstance;
    }

    const token = await getToken();
    if (!token) return null;

    if (!socketInstance) {
      socketInstance = io(API_HOST, {
        auth: { token },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      socketInstance.on('connect', () => {
        setConnected(true);
        socketInstance?.emit('get_online_users');
        if (socketInstance) {
          require('../services/webrtcService').webrtcManager.init(socketInstance);
        }
      });

      socketInstance.on('online_users_list', (userIds: string[]) => {
        require('../store/chatStore').useChatStore.getState().setOnlineUsers(userIds || []);
      });

      socketInstance.on('disconnect', () => {
        setConnected(false);
      });

      socketInstance.on('connect_error', () => {
        setConnected(false);
      });
    } else if (!socketInstance.connected) {
      socketInstance.connect();
    }

    return socketInstance;
  }, []);

  useEffect(() => {
    connectionCount++;
    getSocket();

    return () => {
      connectionCount--;
      if (connectionCount <= 0 && socketInstance) {
        // Keep alive for app duration or disconnect gracefully if completely unmounted
      }
    };
  }, [getSocket]);

  const joinRoom = useCallback(async (room: string) => {
    const socket = await getSocket();
    if (socket && socket.connected) {
      socket.emit('join_room', room);
    }
  }, [getSocket]);

  const emitEvent = useCallback(async (event: string, data: any) => {
    const socket = await getSocket();
    if (socket && socket.connected) {
      socket.emit(event, data);
    }
  }, [getSocket]);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    getSocket().then((socket) => {
      if (socket) {
        socket.off(event, callback); // prevent duplicate binding
        socket.on(event, callback);
      }
    });

    return () => {
      if (socketInstance) {
        socketInstance.off(event, callback);
      }
    };
  }, [getSocket]);

  return {
    connected,
    joinRoom,
    emitEvent,
    subscribe,
    getSocket
  };
}
