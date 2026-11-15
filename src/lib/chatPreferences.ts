/** El estado contraído del chat es una preferencia por usuario. */
export const chatCollapsedKey = (user: string): string =>
  `rubri.chat.collapsed.${encodeURIComponent(user.trim().toLowerCase())}`;

export const readChatCollapsed = (user: string): boolean => {
  if (!user.trim()) return false;
  try {
    return localStorage.getItem(chatCollapsedKey(user)) === '1';
  } catch {
    return false;
  }
};

export const writeChatCollapsed = (user: string, collapsed: boolean): void => {
  if (!user.trim()) return;
  try {
    localStorage.setItem(chatCollapsedKey(user), collapsed ? '1' : '0');
  } catch {
    // Sin almacenamiento local se conserva el estado en memoria.
  }
};
