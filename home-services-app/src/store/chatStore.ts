import { create } from 'zustand';

export interface ChatMessage {
  _id: string;
  id?: string;
  tempId?: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text?: string;
  image?: string;
  location?: any;
  voiceUrl?: string;
  voiceDuration?: number;
  documentUrl?: string;
  documentName?: string;
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
  } | null;
  reactions?: Record<string, string[]>;
  delivered?: boolean;
  deliveredAt?: string;
  deleted?: boolean;
  seen?: boolean;
  seenAt?: string;
  status?: 'sending' | 'sent' | 'failed';
  createdAt: string;
}

export interface Conversation {
  bookingId: string;
  categoryName: string;
  bookingStatus: string;
  otherUser: {
    id: string;
    name: string;
    profilePicture?: string;
  };
  lastMessage?: ChatMessage | null;
  unreadCount: number;
  isPinned?: boolean;
  updatedAt: string;
}

interface ChatStoreState {
  messagesByBooking: Record<string, ChatMessage[]>;
  typingStatusByBooking: Record<string, boolean>;
  onlineUsers: Set<string>;
  conversations: Conversation[];

  setMessages: (bookingId: string, messages: ChatMessage[]) => void;
  addOrUpdateMessage: (bookingId: string, message: ChatMessage) => void;
  addOptimisticMessage: (bookingId: string, message: ChatMessage) => void;
  markMessageFailed: (bookingId: string, tempId: string) => void;
  removeMessage: (bookingId: string, messageId: string) => void;
  updateMessageReactions: (bookingId: string, messageId: string, reactions: Record<string, string[]>) => void;
  setTyping: (bookingId: string, isTyping: boolean) => void;
  setUserPresence: (userId: string, isOnline: boolean) => void;
  setOnlineUsers: (userIds: string[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  togglePinConversation: (bookingId: string) => void;
  markRoomAsRead: (bookingId: string) => void;
}

export const useChatStore = create<ChatStoreState>((set) => ({
  messagesByBooking: {},
  typingStatusByBooking: {},
  onlineUsers: new Set(),
  conversations: [],

  setMessages: (bookingId, messages) =>
    set((state) => ({
      messagesByBooking: {
        ...state.messagesByBooking,
        [bookingId]: messages,
      },
    })),

  addOrUpdateMessage: (bookingId, message) =>
    set((state) => {
      const currentMsgs = state.messagesByBooking[bookingId] || [];

      const existingIndex = currentMsgs.findIndex(
        (m) =>
          (message.tempId && m.tempId === message.tempId) ||
          (m._id && m._id === message._id) ||
          (m.id && m.id === message.id)
      );

      let updatedMsgs: ChatMessage[];
      if (existingIndex >= 0) {
        updatedMsgs = [...currentMsgs];
        updatedMsgs[existingIndex] = { ...message, status: 'sent' };
      } else {
        updatedMsgs = [...currentMsgs, { ...message, status: 'sent' }];
      }

      const updatedConversations = state.conversations.map((conv) => {
        if (conv.bookingId === bookingId) {
          return {
            ...conv,
            lastMessage: message,
            updatedAt: message.createdAt || new Date().toISOString(),
          };
        }
        return conv;
      });

      return {
        messagesByBooking: {
          ...state.messagesByBooking,
          [bookingId]: updatedMsgs,
        },
        conversations: updatedConversations,
      };
    }),

  addOptimisticMessage: (bookingId, message) =>
    set((state) => {
      const currentMsgs = state.messagesByBooking[bookingId] || [];
      return {
        messagesByBooking: {
          ...state.messagesByBooking,
          [bookingId]: [...currentMsgs, { ...message, status: 'sending' }],
        },
      };
    }),

  markMessageFailed: (bookingId, tempId) =>
    set((state) => {
      const currentMsgs = state.messagesByBooking[bookingId] || [];
      const updatedMsgs = currentMsgs.map((m) =>
        m.tempId === tempId ? { ...m, status: 'failed' as const } : m
      );
      return {
        messagesByBooking: {
          ...state.messagesByBooking,
          [bookingId]: updatedMsgs,
        },
      };
    }),

  removeMessage: (bookingId, messageId) =>
    set((state) => {
      const currentMsgs = state.messagesByBooking[bookingId] || [];
      return {
        messagesByBooking: {
          ...state.messagesByBooking,
          [bookingId]: currentMsgs.filter((m) => m._id !== messageId && m.id !== messageId),
        },
      };
    }),

  updateMessageReactions: (bookingId, messageId, reactions) =>
    set((state) => {
      const currentMsgs = state.messagesByBooking[bookingId] || [];
      const updatedMsgs = currentMsgs.map((m) =>
        m._id === messageId || m.id === messageId ? { ...m, reactions } : m
      );
      return {
        messagesByBooking: {
          ...state.messagesByBooking,
          [bookingId]: updatedMsgs,
        },
      };
    }),

  setTyping: (bookingId, isTyping) =>
    set((state) => ({
      typingStatusByBooking: {
        ...state.typingStatusByBooking,
        [bookingId]: isTyping,
      },
    })),

  setUserPresence: (userId, isOnline) =>
    set((state) => {
      const updatedSet = new Set(state.onlineUsers);
      if (isOnline) updatedSet.add(userId);
      else updatedSet.delete(userId);
      return { onlineUsers: updatedSet };
    }),

  setOnlineUsers: (userIds) =>
    set(() => ({
      onlineUsers: new Set(userIds),
    })),

  setConversations: (conversations) => set({ conversations }),

  togglePinConversation: (bookingId) =>
    set((state) => ({
      conversations: state.conversations
        .map((c) => (c.bookingId === bookingId ? { ...c, isPinned: !c.isPinned } : c))
        .sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }),
    })),

  markRoomAsRead: (bookingId) =>
    set((state) => {
      const currentMsgs = state.messagesByBooking[bookingId] || [];
      const updatedMsgs = currentMsgs.map((m) => ({ ...m, seen: true }));
      const updatedConversations = state.conversations.map((c) =>
        c.bookingId === bookingId ? { ...c, unreadCount: 0 } : c
      );
      return {
        messagesByBooking: {
          ...state.messagesByBooking,
          [bookingId]: updatedMsgs,
        },
        conversations: updatedConversations,
      };
    }),
}));
