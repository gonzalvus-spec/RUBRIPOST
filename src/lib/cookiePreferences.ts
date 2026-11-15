const key = (eid: string): string => `rubri.cookies.enviar.${encodeURIComponent(eid)}`;

export const readSendCookies = (eid: string): boolean => {
  try { return localStorage.getItem(key(eid)) !== 'false'; }
  catch { return true; }
};

export const writeSendCookies = (eid: string, enabled: boolean): void => {
  try { localStorage.setItem(key(eid), String(enabled)); }
  catch { /* La preferencia sigue en memoria si no hay almacenamiento local. */ }
};
