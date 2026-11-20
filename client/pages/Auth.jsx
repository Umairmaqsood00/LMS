import React, { useState } from 'react';
import { api } from '../api';
import { Field, Form } from '../components';

export default function Auth({ onLogin }) {
  const [register, setRegister] = useState(false);
  return <div className="auth"><div className="panel"><p className="eyebrow">LEARNING MANAGEMENT SYSTEM</p><h1>{register ? 'Create an account' : 'Welcome to LMS'}</h1><p className="muted">A simple place to teach and learn.</p>
    <Form key={String(register)} label={register ? 'Create account' : 'Log in'} onSubmit={async body => onLogin(await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body }))}>
      {register && <><Field label="Full name" name="FullName" maxLength={100} required /><Field label="Role"><select name="Role"><option>Student</option><option>Teacher</option></select></Field></>}
      <Field label="Email" name="Email" type="email" autoComplete="email" maxLength={100} required />
      <Field label="Password" name="Password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : 1} maxLength={128} required />
    </Form>
    <button className="link" onClick={() => setRegister(!register)}>{register ? 'Already have an account? Log in' : 'Create an account'}</button>
  </div></div>;
}
