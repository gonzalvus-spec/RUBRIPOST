import { create } from 'zustand';

interface ChatState {
  unreadByRequest: Record<string, number>;
  addUnread: (requestKey: string, amount: number) => void;
  clearUnread: (requestKey: string) => void;
}

/** Estado efímero de lectura del chat, separado por proyecto y request. */
export const useChatStore = create<ChatState>((set) => ({
  unreadByRequest: {},
  addUnread: (requestKey, amount) => {
    if (!requestKey || amount <= 0) return;
    set((state) => ({
      unreadByRequest: {
        ...state.unreadByRequest,
        [requestKey]: (state.unreadByRequest[requestKey] ?? 0) + amount,
      },
    }));
  },
  clearUnread: (requestKey) => {
    if (!requestKey) return;
    set((state) => {
      if (!(requestKey in state.unreadByRequest)) return state;
      const unreadByRequest = { ...state.unreadByRequest };
      delete unreadByRequest[requestKey];
      return { unreadByRequest };
    });
  },
}));
