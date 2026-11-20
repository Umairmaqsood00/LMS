import React, { useState } from 'react';

export function Field({ label, children, ...props }) {
  return <label>{label}{children || <input {...props} />}</label>;
}
export function Message({ error, message }) {
  return error ? <p className="message error" role="alert">{error}</p> : message ? <p className="message success" role="status">{message}</p> : null;
}
// Each form sends its own values and shows errors beside the form.
export function Form({ onSubmit, children, label = 'Save', multipart = false }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = new FormData(form);
      const result = await onSubmit(multipart ? data : Object.fromEntries(data));
      setMessage(result?.message || 'Saved.');
      if (form.isConnected && form.dataset.reset !== 'false') form.reset();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} data-reset={label === 'Save profile' || label === 'Save course' ? 'false' : 'true'}><fieldset disabled={busy}>{children}<button type="submit">{busy ? 'Please wait…' : label}</button></fieldset><Message error={error} message={message} /></form>;
}
export function Empty({ children = 'No records yet.' }) { return <p className="muted">{children}</p>; }
export function Table({ columns, rows }) {
  return rows.length ? <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{columns.map(c => <td key={c[0]}>{c[2] ? c[2](row) : row[c[0]] ?? '—'}</td>)}</tr>)}</tbody></table></div> : <Empty />;
}
