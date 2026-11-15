import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  Ellipsis,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import { confirmAction } from '../../../lib/alerts';
import {
  appendChatMessage,
  createChatMessage,
  deleteChatNote,
  isChatAuthor,
  readChatNotes,
  updateChatNote,
  writeChatNotes,
  type ChatMessage,
} from '../../../lib/chatNotes';
import './RequestChatPanel.css';

interface RequestChatPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  user: string;
  author: string;
  eid: string;
  requestKey: string;
  requestName: string;
  /** Se incrementa cuando las notas cambian fuera del panel (p. ej. al guardar). */
  revision: number;
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

/** Panel de notas asociado a la request activa. */
export const RequestChatPanel = ({
  collapsed,
  onToggle,
  user,
  author,
  eid,
  requestKey,
  requestName,
  revision,
}: RequestChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /** El menú se abre hacia arriba cuando no hay espacio suficiente debajo. */
  const [menuUp, setMenuUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(readChatNotes(user, eid, requestKey));
    setDraft('');
    setEditingId(null);
    setEditDraft('');
    setOpenMenuId(null);
    setMenuUp(false);
  }, [user, eid, requestKey, revision]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.request-chat-message-actions')
      ) {
        return;
      }
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

  const submit = () => {
    const message = createChatMessage(
      author || user || 'Tú',
      draft,
      new Date(),
      undefined,
      user,
    );
    if (!message) return;

    const next = appendChatMessage(messages, message);
    setMessages(next);
    writeChatNotes(user, eid, requestKey, next);
    setDraft('');
  };

  const startEdit = (message: ChatMessage) => {
    setOpenMenuId(null);
    setEditingId(message.id);
    setEditDraft(message.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = () => {
    if (!editingId) return;
    const next = updateChatNote(user, eid, requestKey, editingId, editDraft);
    if (!next) return;
    setMessages(next);
    cancelEdit();
  };

  const removeMessage = async (message: ChatMessage) => {
    setOpenMenuId(null);
    const confirmed = await confirmAction({
      title: '¿Eliminar este mensaje?',
      text: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!confirmed) return;

    const next = deleteChatNote(user, eid, requestKey, message.id);
    if (!next) return;
    setMessages(next);
    if (editingId === message.id) cancelEdit();
  };

  return (
    <aside
      className={clsx('request-chat', { collapsed })}
      aria-label={`Chat de ${requestName || 'la request'}`}
    >
      {collapsed ? (
        <button
          type="button"
          className="request-chat-rail"
          onClick={onToggle}
          title="Expandir chat"
          aria-label="Expandir chat"
        >
          <PanelRightOpen size={15} />
          <MessageSquare size={15} />
          {messages.length > 0 && (
            <span className="request-chat-count">{messages.length}</span>
          )}
          <span className="request-chat-rail-label">Chat</span>
        </button>
      ) : (
        <>
          <header className="request-chat-head">
            <span className="request-chat-title">
              <MessageSquare size={14} />
              Chat
            </span>
            <div className="request-chat-head-actions">
              <button
                type="button"
                className="icon-btn tiny"
                onClick={onToggle}
                title="Contraer chat"
                aria-label="Contraer chat"
              >
                <PanelRightClose size={14} />
              </button>
            </div>
          </header>

          <div className="request-chat-body" ref={scrollRef}>
            {messages.length === 0 ? (
              <p className="request-chat-empty">
                Aún no hay notas para <strong>{requestName || 'esta request'}</strong>.
                Escribe una idea, un recordatorio o el resultado de una prueba y
                quedará guardada junto a la petición.
              </p>
            ) : (
              messages.map((message) => {
                const canManage = isChatAuthor(message, user);
                const isEditing = editingId === message.id;
                const isMenuOpen = openMenuId === message.id;
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
                      <strong>{message.author || 'Tú'}</strong>
                      <div className="request-chat-message-meta">
                        {message.editedAt && (
                          <span className="request-chat-edited">editado</span>
                        )}
                        <time dateTime={message.createdAt}>
                          {formatTime(message.createdAt)}
                        </time>
                        {canManage && !isEditing && (
                          <span className="request-chat-message-actions">
                            <button
                              type="button"
                              className="request-chat-menu-trigger"
                              onClick={(event) => {
                                if (openMenuId === message.id) {
                                  setOpenMenuId(null);
                                  return;
                                }
                                const trigger = event.currentTarget.getBoundingClientRect();
                                const bounds = scrollRef.current?.getBoundingClientRect();
                                const below = bounds ? bounds.bottom - trigger.bottom : 0;
                                const above = bounds ? trigger.top - bounds.top : 0;
                                // ~80 px cubre el alto del menú y su separación.
                                setMenuUp(below < 80 && above > below);
                                setOpenMenuId(message.id);
                              }}
                              title="Acciones del mensaje"
                              aria-label="Acciones del mensaje"
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                            >
                              <Ellipsis size={14} />
                            </button>
                            {isMenuOpen && (
                              <div className="request-chat-message-menu" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => startEdit(message)}
                                >
                                  <Pencil size={12} />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="danger"
                                  onClick={() => void removeMessage(message)}
                                >
                                  <Trash2 size={12} />
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </span>
                        )}
                      </div>
                    </header>
                    {isEditing ? (
                      <form
                        className="request-chat-edit"
                        onSubmit={(event) => {
                          event.preventDefault();
                          saveEdit();
                        }}
                      >
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelEdit();
                            }
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              saveEdit();
                            }
                          }}
                          rows={2}
                          autoFocus
                          aria-label="Editar nota"
                        />
                        <span className="request-chat-edit-actions">
                          <button
                            type="submit"
                            className="request-chat-edit-save"
                            disabled={!editDraft.trim()}
                            title="Guardar cambios"
                            aria-label="Guardar cambios"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            className="request-chat-edit-cancel"
                            onClick={cancelEdit}
                            title="Cancelar edición"
                            aria-label="Cancelar edición"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      </form>
                    ) : (
                      <p>{message.text}</p>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <form
            className="request-chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Escribe una nota… (Enter para enviar)"
              rows={2}
              aria-label="Nota del chat"
            />
            <button
              type="submit"
              className="request-chat-send"
              disabled={!draft.trim()}
              title="Enviar nota"
              aria-label="Enviar nota"
            >
              <Send size={14} />
            </button>
          </form>
        </>
      )}
    </aside>
  );
};

export default RequestChatPanel;
