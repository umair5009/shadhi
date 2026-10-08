import { createContext, useContext, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';

const ConfirmContext = createContext(null);

/**
 * Promise-based confirmation for destructive actions:
 *   const reason = await confirm({ title, message, confirmLabel, danger: true, requireReason: true });
 * Resolves to false when cancelled, true when confirmed, or the typed reason when `requireReason` is set.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [reason, setReason] = useState('');
  const resolver = useRef(null);

  const confirm = (options) =>
    new Promise((resolve) => {
      resolver.current = resolve;
      setReason('');
      setState(options);
    });

  const finish = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  };

  const needsReason = Boolean(state?.requireReason);
  const canConfirm = !needsReason || reason.trim().length >= 3;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(state)}
        onClose={() => finish(false)}
        title={state?.title ?? 'Are you sure?'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => finish(false)}>
              {state?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} disabled={!canConfirm} onClick={() => finish(needsReason ? reason.trim() : true)}>
              {state?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="stack">
          {state?.message && <p className="secondary">{state.message}</p>}
          {needsReason && (
            <label className="field">
              <span className="field__label">{state.reasonLabel ?? 'Reason'}</span>
              <textarea
                className="textarea"
                value={reason}
                autoFocus
                placeholder={state.reasonPlaceholder ?? 'Write a short reason for the record'}
                onChange={(event) => setReason(event.target.value)}
              />
              <span className="field__hint">This is saved in the history for accountability.</span>
            </label>
          )}
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
