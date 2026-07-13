import Modal from './Modal';

export default function ConfirmDialog({ title = 'Confirm', message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ marginBottom: 16 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
