import { invoke } from '@tauri-apps/api/core';

interface ChatMessageWire {
  id: string;
  user_id: string;
  user_name: string;
  contenido: string;
  eid: string;
  request_key: string;
  request_name: string;
  created_at: string;
  updated_at: string | null;
  edited: boolean;
}

export interface SharedChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  eid: string;
  requestKey: string;
  requestName: string;
  createdAt: string;
  updatedAt: string | null;
  edited: boolean;
}

const fromWire = (message: ChatMessageWire): SharedChatMessage => ({
  id: message.id,
  userId: message.user_id,
  userName: message.user_name,
  content: message.contenido,
  eid: message.eid,
  requestKey: message.request_key,
  requestName: message.request_name,
  createdAt: message.created_at,
  updatedAt: message.updated_at,
  edited: message.edited,
});

export const getChatMessages = async (
  eid: string,
  requestKey: string,
): Promise<SharedChatMessage[]> => {
  const messages = await invoke<ChatMessageWire[]>('get_chat_messages', {
    payload: { eid, request_key: requestKey },
  });
  return messages.map(fromWire);
};

export const sendChatMessage = async (input: {
  userId: string;
  eid: string;
  requestKey: string;
  requestName: string;
  content: string;
}): Promise<SharedChatMessage> => {
  const message = await invoke<ChatMessageWire>('send_chat_message', {
    payload: {
      user_id: input.userId,
      eid: input.eid,
      request_key: input.requestKey,
      request_name: input.requestName,
      contenido: input.content,
    },
  });
  return fromWire(message);
};

export const updateChatMessage = async (input: {
  messageId: string;
  userId: string;
  eid: string;
  requestKey: string;
  content: string;
}): Promise<SharedChatMessage> => {
  const message = await invoke<ChatMessageWire>('update_chat_message', {
    payload: {
      message_id: input.messageId,
      user_id: input.userId,
      eid: input.eid,
      request_key: input.requestKey,
      contenido: input.content,
    },
  });
  return fromWire(message);
};

export const deleteChatMessage = async (input: {
  messageId: string;
  userId: string;
  eid: string;
  requestKey: string;
}): Promise<void> => {
  await invoke('delete_chat_message', {
    payload: {
      message_id: input.messageId,
      user_id: input.userId,
      eid: input.eid,
      request_key: input.requestKey,
    },
  });
};
