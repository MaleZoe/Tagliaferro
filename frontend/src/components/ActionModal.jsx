import { useEffect, useState } from 'react';

// Modal reutilizable para confirmaciones y textos breves sin diálogos nativos del navegador.
export default function ActionModal({ open, title, description, mode = 'confirm', initialValue = '', placeholder = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel, busy = false, required = false, minLength = 0 }) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (open) setValue(initialValue); }, [open, initialValue]);
  if (!open) return null;
  const submit = (event) => { event.preventDefault(); onConfirm(mode === 'prompt' ? value : undefined); };
  return <div className="react-scrim action-modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="react-form-dialog action-modal" role="dialog" aria-modal="true" aria-labelledby="action-modal-title" onSubmit={submit}>
      <h2 id="action-modal-title">{title}</h2><p>{description}</p>
      {mode === 'prompt' && <textarea autoFocus rows="4" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} required={required} minLength={minLength} maxLength="4000" />}
      <div className="action-modal-actions"><button type="button" className="btn btn-outline-dark" onClick={onCancel} disabled={busy}>{cancelLabel}</button><button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (mode === 'prompt' && required && value.trim().length < minLength)}>{busy ? 'PROCESANDO…' : confirmLabel}</button></div>
    </form>
  </div>;
}
