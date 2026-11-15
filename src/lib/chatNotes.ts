export interface ChatMessage {
  id: string;
  author: string;
  /** Usuario propietario del mensaje. Vacío en notas antiguas sin autoría. */
  userId: string;
  text: string;
  createdAt: string;
  /** Se rellena solo cuando el autor editó el texto. */
  editedAt?: string;
}

/** Máximo de notas que se conservan por request. */
export const CHAT_NOTES_LIMIT = 200;

const normalizeUserId = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  return Number.isNaN(new Date(value).getTime()) ? undefined : value;
};

/**
 * Cada request guarda sus notas por usuario, proyecto y request. Las requests
 * nuevas usan una clave de borrador que luego se migra al id definitivo.
 */
export const chatNotesKey = (user: string, eid: string, requestKey: string): string =>
  `rubri.chat.${encodeURIComponent(JSON.stringify([user.trim().toLowerCase(), eid, requestKey]))}`;

const normalizeMessage = (value: unknown): ChatMessage | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (!id || !text) return null;

  const author = typeof record.author === 'string' ? record.author.trim() : '';
  const createdAt = normalizeDate(record.createdAt) ?? new Date(0).toISOString();
  const editedAt = normalizeDate(record.editedAt);

  return {
    id,
    author,
    userId: normalizeUserId(record.userId),
    text,
    createdAt,
    ...(editedAt ? { editedAt } : {}),
  };
};

export const readChatNotes = (
  user: string,
  eid: string,
  requestKey: string,
): ChatMessage[] => {
  if (!user || !eid || !requestKey) return [];
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(chatNotesKey(user, eid, requestKey)) ?? '[]',
    );
    if (!Array.isArray(value)) return [];
    return value
      .map(normalizeMessage)
      .filter((message): message is ChatMessage => message !== null)
      .slice(-CHAT_NOTES_LIMIT);
  } catch {
    return [];
  }
};

export const writeChatNotes = (
  user: string,
  eid: string,
  requestKey: string,
  messages: ChatMessage[],
): void => {
  if (!user || !eid || !requestKey) return;
  try {
    localStorage.setItem(
      chatNotesKey(user, eid, requestKey),
      JSON.stringify(messages.slice(-CHAT_NOTES_LIMIT)),
    );
  } catch {
    // Si no hay almacenamiento local, las notas siguen en memoria.
  }
};

export const removeChatNotes = (user: string, eid: string, requestKey: string): void => {
  if (!user || !eid || !requestKey) return;
  try {
    localStorage.removeItem(chatNotesKey(user, eid, requestKey));
  } catch {
    // Sin almacenamiento local no hay nada que borrar.
  }
};

/** Crea una nota válida; los mensajes vacíos se ignoran. */
export const createChatMessage = (
  author: string,
  text: string,
  now: Date = new Date(),
  id?: string,
  userId = '',
): ChatMessage | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return {
    id: id ?? `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    author: author.trim() || 'Anónimo',
    userId: normalizeUserId(userId),
    text: trimmed,
    createdAt: now.toISOString(),
  };
};

/**
 * Solo el autor puede gestionar su mensaje. Las notas antiguas sin `userId`
 * quedan protegidas: nadie puede editarlas ni eliminarlas.
 */
export const isChatAuthor = (message: ChatMessage, userId: string): boolean => {
  const owner = normalizeUserId(message.userId);
  const current = normalizeUserId(userId);
  return !!owner && !!current && owner === current;
};

/** Edita el texto de una nota propia; devuelve `null` si no está permitido. */
export const updateChatMessage = (
  messages: ChatMessage[],
  messageId: string,
  text: string,
  userId: string,
  now: Date = new Date(),
): ChatMessage[] | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0 || !isChatAuthor(messages[index], userId)) return null;
  if (messages[index].text === trimmed) return messages;

  const next = messages.slice();
  next[index] = { ...messages[index], text: trimmed, editedAt: now.toISOString() };
  return next;
};

/** Elimina una nota propia; devuelve `null` si no está permitido. */
export const deleteChatMessage = (
  messages: ChatMessage[],
  messageId: string,
  userId: string,
): ChatMessage[] | null => {
  const target = messages.find((message) => message.id === messageId);
  if (!target || !isChatAuthor(target, userId)) return null;
  return messages.filter((message) => message.id !== messageId);
};

export const appendChatMessage = (
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] => [...messages, message].slice(-CHAT_NOTES_LIMIT);

/** Edita en el almacenamiento validando la autoría contra el usuario actual. */
export const updateChatNote = (
  user: string,
  eid: string,
  requestKey: string,
  messageId: string,
  text: string,
  now: Date = new Date(),
): ChatMessage[] | null => {
  const current = readChatNotes(user, eid, requestKey);
  const next = updateChatMessage(current, messageId, text, user, now);
  if (!next) return null;
  if (next !== current) writeChatNotes(user, eid, requestKey, next);
  return next;
};

/** Elimina del almacenamiento validando la autoría contra el usuario actual. */
export const deleteChatNote = (
  user: string,
  eid: string,
  requestKey: string,
  messageId: string,
): ChatMessage[] | null => {
  const current = readChatNotes(user, eid, requestKey);
  const next = deleteChatMessage(current, messageId, user);
  if (!next) return null;
  writeChatNotes(user, eid, requestKey, next);
  return next;
};

/** Traslada las notas del borrador a la request recién guardada. */
export const moveChatNotes = (
  user: string,
  eid: string,
  from: string,
  to: string,
): void => {
  if (!from || !to || from === to) return;
  const notes = readChatNotes(user, eid, from);
  if (notes.length === 0) return;
  writeChatNotes(user, eid, to, notes);
  removeChatNotes(user, eid, from);
};
