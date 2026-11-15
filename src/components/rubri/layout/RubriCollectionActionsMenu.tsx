import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, FolderPlus, MoreHorizontal, Pencil, Plus, Trash } from 'lucide-react';

interface RubriCollectionActionsMenuProps {
  nombre: string;
  onNewSubcollection: () => void;
  onNewRequest: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Permite mantener visible el botón mientras el menú está abierto. */
  onOpenChange?: (open: boolean) => void;
}

const MENU_WIDTH = 200;
const MENU_HEIGHT = 188;

/** El portal evita que el scroll del sidebar recorte las opciones. */
export const RubriCollectionActionsMenu = ({
  nombre,
  onNewSubcollection,
  onNewRequest,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenChange,
}: RubriCollectionActionsMenuProps) => {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const close = () => {
    setPosition(null);
    onOpenChangeRef.current?.(false);
  };

  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setPosition(null);
        onOpenChangeRef.current?.(false);
      }
    };
    const closeMenu = () => {
      setPosition(null);
      onOpenChangeRef.current?.(false);
    };
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [position]);

  const choose = (action: () => void) => {
    close();
    buttonRef.current?.focus();
    action();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn tiny collection-actions-trigger"
        aria-label={`Más opciones de ${nombre}`}
        aria-haspopup="menu"
        aria-expanded={!!position}
        title="Más opciones"
        onClick={() => {
          if (position) {
            close();
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (!rect) return;
          setPosition({
            left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
            top: rect.bottom + 4 + MENU_HEIGHT > window.innerHeight
              ? Math.max(8, rect.top - MENU_HEIGHT - 4)
              : rect.bottom + 4,
          });
          onOpenChangeRef.current?.(true);
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {position && createPortal(
        <div
          ref={menuRef}
          className="sidebar-collection-menu"
          style={position}
          role="menu"
          aria-label={`Opciones de ${nombre}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Tab') {
              if (event.key === 'Escape') event.preventDefault();
              close();
              buttonRef.current?.focus();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }
          }}
        >
          <button type="button" role="menuitem" onClick={() => choose(onNewSubcollection)}>
            <FolderPlus size={13} /> Nueva subcolección
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onNewRequest)}>
            <Plus size={13} /> Nueva request
          </button>
          <div className="sidebar-collection-menu-separator" role="separator" />
          <button type="button" role="menuitem" onClick={() => choose(onEdit)}>
            <Pencil size={13} /> Editar
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onDuplicate)}>
            <Copy size={13} /> Duplicar
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => choose(onDelete)}>
            <Trash size={13} /> Eliminar
          </button>
        </div>,
        document.body,
      )}
    </>
  );
};

export default RubriCollectionActionsMenu;
