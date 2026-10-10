'use client';

import { useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { DemoUser, ROLE_LABEL, Role } from '@/lib/types';
import Denied from '@/components/Denied';
import { uid } from '@/lib/format';

export default function UsersPage() {
  const { data, currentUser, saveUser, setUserActive } = useStore();
  const [editing, setEditing] = useState<DemoUser | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [error, setError] = useState('');

  if (!roleAllowed(currentUser?.role, 'users')) return <Denied />;
  if (!data) return null;

  const openAdd = () => {
    setEditing({ id: uid('u'), name: '', role: 'cashier', active: true });
    setName('');
    setRole('cashier');
    setError('');
  };

  const openEdit = (u: DemoUser) => {
    setEditing({ ...u });
    setName(u.name);
    setRole(u.role);
    setError('');
  };

  const save = () => {
    if (!editing) return;
    if (!name.trim()) return setError('Name is required.');
    saveUser({ ...editing, name: name.trim(), role });
    setEditing(null);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500">Demo accounts only — no real authentication.</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add user</button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td>
                  <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2.5 py-1">
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${u.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button className="text-brand-600 hover:text-brand-800 text-sm font-medium mr-3" onClick={() => openEdit(u)}>
                    Edit
                  </button>
                  <button
                    className={`text-sm font-medium ${u.active ? 'text-amber-600 hover:text-amber-800' : 'text-green-600 hover:text-green-800'}`}
                    onClick={() => setUserActive(u.id, !u.active)}
                    disabled={u.id === currentUser?.id}
                    title={u.id === currentUser?.id ? 'You cannot deactivate yourself' : ''}
                  >
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {data.users.some((u) => u.id === editing.id) ? 'Edit user' : 'Add user'}
            </h2>
            <label className="label" htmlFor="uname">Name</label>
            <input id="uname" className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            <label className="label" htmlFor="urole">Role</label>
            <select id="urole" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="admin">Admin — everything</option>
              <option value="manager">Manager — no user management</option>
              <option value="cashier">Cashier — POS + returns only</option>
            </select>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-secondary flex-1" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
