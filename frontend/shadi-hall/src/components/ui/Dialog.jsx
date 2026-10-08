import { useEffect, useId, useRef } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { IconButton } from './Button';

/**
 * Modal built on the native <dialog> element: focus trapping, Esc to close and the backdrop come from the browser.
 * @param {{ open: boolean, onClose: () => void, title: string, description?: string, size?: 'sm'|'md'|'lg'|'xl',
 *           footer?: import('react').ReactNode, children: import('react').ReactNode }} props
 */
export function Dialog({ open, onClose, title, description, size = 'md', footer, children, className }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={clsx('dialog', size !== 'md' && `dialog--${size}`, className)}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        // Click on the backdrop (outside the panel) closes.
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
    >
      {open && (
        <>
          <div className="dialog__header">
            <div>
              <h2 id={titleId} className="dialog__title">
                {title}
              </h2>
              {description && <p className="dialog__description">{description}</p>}
            </div>
            <IconButton icon={X} label="Close" variant="ghost" size="sm" onClick={onClose} />
          </div>
          <div className="dialog__body">{children}</div>
          {footer && <div className="dialog__footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
