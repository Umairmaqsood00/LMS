import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Field, Form, Message } from '../components';

export default function Profile({ user }) {
  const [profile, setProfile] = useState(null), [error, setError] = useState('');
  useEffect(() => { api('/profile').then(setProfile).catch(e => setError(e.message)); }, []);
  return <><h1>My profile</h1><Message error={error} />{profile && <div className="panel narrow"><p className="muted">{profile.Email} · {profile.Role}</p><Form label="Save profile" onSubmit={body => api('/profile', { method: 'PUT', body })}>
    <Field label="Full name" name="FullName" defaultValue={profile.FullName} maxLength={100} required />
    <Field label="Phone" name="Phone" defaultValue={profile.Phone} maxLength={20} />
    {user.Role === 'Teacher' ? <><Field label="Qualification" name="Qualification" defaultValue={profile.Qualification} maxLength={100} /><Field label="Bio"><textarea name="Bio" defaultValue={profile.Bio || ''} maxLength={500}/></Field></> : <Field label="Institution" name="Institution" defaultValue={profile.Institution} maxLength={100} />}
    <h3>Change password (optional)</h3><Field label="Current password" name="CurrentPassword" type="password" autoComplete="current-password" maxLength={128} /><Field label="New password" name="NewPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} />
  </Form></div>}</>;
}
