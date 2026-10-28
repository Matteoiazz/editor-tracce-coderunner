import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";

export interface MenuItem {
  label: ReactNode;
  /** Riga più piccola sotto l'etichetta, es. l'anteprima di un esercizio. */
  description?: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}

export interface MenuGroup {
  heading?: string;
  items: MenuItem[];
}

interface Props {
  /** Contenuto del pulsante che apre il menu. */
  label: ReactNode;
  groups: MenuGroup[];
  className?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  /** Lato del pulsante a cui si allinea il menu. */
  align?: "start" | "end";
}

/** Pulsante con un menu di azioni. Il menu sta nel livello più alto della pagina (popover), così
 *  non viene tagliato dalle aree che scorrono, e si apre sopra il pulsante se sotto non c'è
 *  spazio. Si chiude con Esc o con un clic fuori; le frecce spostano il fuoco tra le voci. */
export function Menu({ label, groups, className = "ghost", ariaLabel, title, disabled, align = "start" }: Props) {
  const id = useId();
  const anchor = `--menu-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // All'apertura il fuoco va alla prima voce; alla chiusura torna al pulsante se era nel menu
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onToggle = (event: Event) => {
      const { newState } = event as ToggleEvent;
      if (newState === "open") {
        items()[0]?.focus();
      } else if (menu.contains(document.activeElement)) {
        buttonRef.current?.focus();
      }
    };
    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, []);

  function items(): HTMLButtonElement[] {
    return [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role=menuitem]:not(:disabled)") ?? [])];
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Tab") menuRef.current?.hidePopover();
  }

  function choose(item: MenuItem) {
    menuRef.current?.hidePopover();
    item.onSelect();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        popoverTarget={id}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        style={{ anchorName: anchor } as CSSProperties}
      >
        {label}
      </button>
      <div
        ref={menuRef}
        id={id}
        popover="auto"
        role="menu"
        aria-label={ariaLabel}
        className={`menu-popover${align === "end" ? " align-end" : ""}`}
        style={{ positionAnchor: anchor } as CSSProperties}
        onKeyDown={onKeyDown}
      >
        {groups
          .filter((group) => group.items.length > 0)
          .map((group, g) => (
            <div key={group.heading ?? g} className="menu-group" role="group" aria-label={group.heading}>
              {group.heading && <p className="menu-heading">{group.heading}</p>}
              {group.items.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={item.danger ? "menu-item danger" : "menu-item"}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => choose(item)}
                >
                  {item.icon && <span className="menu-icon">{item.icon}</span>}
                  <span className="menu-text">
                    <span className="menu-label">{item.label}</span>
                    {item.description && <span className="menu-description">{item.description}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
      </div>
    </>
  );
}
