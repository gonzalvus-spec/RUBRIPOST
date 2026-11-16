import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  Ellipsis,
  LoaderCircle,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import { confirmAction, notify } from '../../../lib/alerts';
import {
  deleteChatMessage,
  getChatMessages,
  sendChatMessage,
  updateChatMessage,
  type SharedChatMessage,
} from '../../../lib/chat';
import './RequestChatPanel.css';

interface RequestChatPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  userId: string;
  eid: string;
  requestKey: string;
  requestName: string;
}

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Chat compartido en MongoDB para la request activa. */
export const RequestChatPanel = ({
  collapsed,
  onToggle,
  userId,
  eid,
  requestKey,
  requestName,
}: RequestChatPanelProps) => {
  const [messages, setMessages] = useState<SharedChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async (showError = false) => {
    if (!eid || !requestKey) return;
    try {
      const next = await getChatMessages(eid, requestKey);
      setMessages(next);
    } catch (error) {
      console.warn('No se pudo actualizar el chat', error);
      if (showError) notify.error('No se pudo cargar el chat', String(error));
    }
  }, [eid, requestKey]);

  useEffect(() => {
    setMessages([]);
    setDraft('');
    setEditingId(null);
    setEditDraft('');
    setOpenMenuId(null);
    if (collapsed) return;
    setLoading(true);
    void refresh(true).finally(() => setLoading(false));
    const interval = window.setInterval(() => void refresh(false), 4000);
    return () => window.clearInterval(interval);
  }, [collapsed, refresh]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.request-chat-message-actions')) return;
      setOpenMenuId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (collapsed) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, collapsed]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending || !userId) return;
    setSending(true);
    try {
      const message = await sendChatMessage({
        userId,
        eid,
        requestKey,
        requestName,
        content,
      });
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message]);
      setDraft('');
    } catch (error) {
      notify.error('No se pudo enviar el mensaje', String(error));
    } finally {
      setSending(false);
    }
  };

  const startEdit = (message: SharedChatMessage) => {
    setOpenMenuId(null);
    setEditingId(message.id);
    setEditDraft(message.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft.trim() || mutatingId) return;
    setMutatingId(editingId);
    try {
      const updated = await updateChatMessage({
        messageId: editingId,
        userId,
        eid,
        requestKey,
        content: editDraft,
      });
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
      cancelEdit();
    } catch (error) {
      notify.error('No se pudo editar el mensaje', String(error));
    } finally {
      setMutatingId(null);
    }
  };

  const removeMessage = async (message: SharedChatMessage) => {
    setOpenMenuId(null);
    const confirmed = await confirmAction({
      title: '¿Eliminar este mensaje?',
      text: 'Esta acción no se puede deshacer y será visible para todo el equipo.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!confirmed) return;

    setMutatingId(message.id);
    try {
      await deleteChatMessage({ messageId: message.id, userId, eid, requestKey });
      setMessages((current) => current.filter((item) => item.id !== message.id));
      if (editingId === message.id) cancelEdit();
    } catch (error) {
      notify.error('No se pudo eliminar el mensaje', String(error));
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <aside className={clsx('request-chat', { collapsed })} aria-label={`Chat de ${requestName || 'la request'}`}>
      {collapsed ? (
        <button type="button" className="request-chat-rail" onClick={onToggle} title="Expandir chat" aria-label="Expandir chat">
          <PanelRightOpen size={15} />
          <MessageSquare size={15} />
          {messages.length > 0 && <span className="request-chat-count">{messages.length}</span>}
          <span className="request-chat-rail-label">Chat</span>
        </button>
      ) : (
        <>
          <header className="request-chat-head">
            <span className="request-chat-title"><MessageSquare size={14} /> Chat compartido</span>
            <div className="request-chat-head-actions">
              <button type="button" className="icon-btn tiny" onClick={() => void refresh(true)} title="Actualizar chat" aria-label="Actualizar chat">
                <RefreshCw size={13} />
              </button>
              <button type="button" className="icon-btn tiny" onClick={onToggle} title="Contraer chat" aria-label="Contraer chat">
                <PanelRightClose size={14} />
              </button>
            </div>
          </header>

          <div className="request-chat-body" ref={scrollRef}>
            {!requestKey ? (
              <p className="request-chat-empty">Guarda la request para habilitar su chat compartido.</p>
            ) : loading ? (
              <p className="request-chat-empty"><LoaderCircle size={16} className="spin" /> Cargando mensajes...</p>
            ) : messages.length === 0 ? (
              <p className="request-chat-empty">Aún no hay mensajes compartidos para <strong>{requestName || 'esta request'}</strong>.</p>
            ) : messages.map((message) => {
              const canManage = message.userId === userId;
              const isEditing = editingId === message.id;
              const isMenuOpen = openMenuId === message.id;
              const isMutating = mutatingId === message.id;
              return (
                <article
                  key={message.id}
                  className={clsx('request-chat-message', {
                    'is-own': canManage,
                    'menu-open': isMenuOpen,
                    'menu-up': isMenuOpen && menuUp,
                  })}
                >
                  <header>
                    <strong>{message.userName}</strong>
                    <div className="request-chat-message-meta">
                      {message.edited && <span className="request-chat-edited">editado</span>}
                      <time dateTime={message.createdAt} title={message.updatedAt ? `Editado: ${formatTime(message.updatedAt)}` : undefined}>
                        {formatTime(message.createdAt)}
                      </time>
                      {canManage && !isEditing && (
                        <span className="request-chat-message-actions">
                          <button
                            type="button"
                            className="request-chat-menu-trigger"
                            disabled={isMutating}
                            onClick={(event) => {
                              if (isMenuOpen) {
                                setOpenMenuId(null);
                                return;
                              }
                              const trigger = event.currentTarget.getBoundingClientRect();
                              const bounds = scrollRef.current?.getBoundingClientRect();
                              const below = bounds ? bounds.bottom - trigger.bottom : 0;
                              const above = bounds ? trigger.top - bounds.top : 0;
                              setMenuUp(below < 80 && above > below);
                              setOpenMenuId(message.id);
                            }}
                            title="Acciones del mensaje"
                            aria-label="Acciones del mensaje"
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                          >
                            {isMutating ? <LoaderCircle size={13} className="spin" /> : <Ellipsis size={14} />}
                          </button>
                          {isMenuOpen && (
                            <div className="request-chat-message-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => startEdit(message)}>
                                <Pencil size={12} /> Editar
                              </button>
                              <button type="button" role="menuitem" className="danger" onClick={() => void removeMessage(message)}>
                                <Trash2 size={12} /> Eliminar
                              </button>
                            </div>
                          )}
                        </span>
                      )}
                    </div>
                  </header>
                  {isEditing ? (
                    <form className="request-chat-edit" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
                      <textarea
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelEdit();
                          } else if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void saveEdit();
                          }
                        }}
                        rows={2}
                        maxLength={4000}
                        autoFocus
                        aria-label="Editar mensaje"
                      />
                      <span className="request-chat-edit-actions">
                        <button type="submit" className="request-chat-edit-save" disabled={!editDraft.trim() || isMutating} title="Guardar cambios" aria-label="Guardar cambios">
                          {isMutating ? <LoaderCircle size={12} className="spin" /> : <Check size={13} />}
                        </button>
                        <button type="button" className="request-chat-edit-cancel" onClick={cancelEdit} disabled={isMutating} title="Cancelar edición" aria-label="Cancelar edición">
                          <X size={13} />
                        </button>
                      </span>
                    </form>
                  ) : <p>{message.content}</p>}
                </article>
              );
            })}
          </div>

          <form className="request-chat-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Mensaje para el equipo…"
              rows={2}
              maxLength={4000}
              disabled={!requestKey}
              aria-label="Mensaje del chat"
            />
            <button type="submit" className="request-chat-send" disabled={!requestKey || !draft.trim() || sending} title="Enviar mensaje" aria-label="Enviar mensaje">
              {sending ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}
            </button>
          </form>
        </>
      )}
    </aside>
  );
};

export default RequestChatPanel;
