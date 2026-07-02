import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, X } from 'lucide-react';
import { MetrologyUser } from '../types';
import { changeOwnPasswordInSupabase, getActiveSupabaseClient } from '../supabaseSync';
import { validatePasswordStrength, verifyUserPassword } from '../utils/passwordUtils';
import { logAuditEvent } from '../services/loginHistoryService';

interface ChangePasswordModalProps {
  currentUser: MetrologyUser;
  usersList: MetrologyUser[];
  onClose: () => void;
  onPasswordChanged: (updatedUser: MetrologyUser) => void;
}

type PasswordField = 'current' | 'next' | 'confirm';

const REQUIRED_MESSAGE = 'សូមបំពេញព័ត៌មានពាក្យសម្ងាត់ទាំងអស់។ / Please fill in all password fields.';
const WRONG_CURRENT_MESSAGE = 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ។ / Current password is incorrect.';
const MISMATCH_MESSAGE = 'ពាក្យសម្ងាត់ថ្មី និងការបញ្ជាក់មិនដូចគ្នាទេ។ / New password and confirmation do not match.';
const SAME_PASSWORD_MESSAGE = 'ពាក្យសម្ងាត់ថ្មីត្រូវតែខុសពីពាក្យសម្ងាត់បច្ចុប្បន្ន។ / New password must be different from the current password.';
const FAILURE_MESSAGE = 'មិនអាចប្តូរពាក្យសម្ងាត់បានទេ។ សូមព្យាយាមម្តងទៀត។ / Unable to change password. Please try again.';
const SUCCESS_MESSAGE = 'ពាក្យសម្ងាត់ត្រូវបានប្តូរដោយជោគជ័យ។ / Password changed successfully.';

export default function ChangePasswordModal({
  currentUser,
  usersList,
  onClose,
  onPasswordChanged,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visibleFields, setVisibleFields] = useState<Record<PasswordField, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ownUser = usersList.find(u => u.id === currentUser.id) || currentUser;

  const toggleField = (field: PasswordField) => {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const renderPasswordField = (
    id: string,
    field: PasswordField,
    label: string,
    value: string,
    onChange: (value: string) => void
  ) => (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[14px] font-extrabold leading-relaxed text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visibleFields[field] ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 pr-12 text-[16px] font-semibold text-slate-900 outline-none transition focus:border-[#353C96] focus:ring-2 focus:ring-[#353C96]/20"
          autoComplete={field === 'current' ? 'current-password' : 'new-password'}
        />
        <button
          type="button"
          onClick={() => toggleField(field)}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label={visibleFields[field] ? 'Hide password' : 'Show password'}
        >
          {visibleFields[field] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );

  const verifyCurrentPassword = async (): Promise<boolean> => {
    const client = getActiveSupabaseClient();
    if (client) {
      const usernameOrEmail = (ownUser.email && ownUser.email !== 'N/A') ? ownUser.email : ownUser.username;
      const email = usernameOrEmail.includes('@') ? usernameOrEmail : `${ownUser.username.toLowerCase()}@nmc.gov.kh`;
      const { error } = await client.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (!error) return true;
    }

    return verifyUserPassword(currentPassword, ownUser);
  };

  const updateSupabaseAuthPasswordIfAvailable = async () => {
    const client = getActiveSupabaseClient();
    if (!client) return;

    const { data } = await client.auth.getSession();
    if (!data.session) return;

    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: REQUIRED_MESSAGE });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: MISMATCH_MESSAGE });
      return;
    }
    if (newPassword === currentPassword) {
      setMessage({ type: 'error', text: SAME_PASSWORD_MESSAGE });
      return;
    }
    const strengthMessage = validatePasswordStrength(newPassword);
    if (strengthMessage) {
      setMessage({ type: 'error', text: strengthMessage });
      return;
    }

    setIsSubmitting(true);
    try {
      const verified = await verifyCurrentPassword();
      if (!verified) {
        setMessage({ type: 'error', text: WRONG_CURRENT_MESSAGE });
        await logAuditEvent(currentUser, 'CHANGE_OWN_PASSWORD', `Password change failed for @${currentUser.username}: wrong current password`, currentUser.id, currentUser.username);
        return;
      }

      await updateSupabaseAuthPasswordIfAvailable();
      const updatedUser = await changeOwnPasswordInSupabase(ownUser, newPassword);
      onPasswordChanged(updatedUser);
      setMessage({ type: 'success', text: SUCCESS_MESSAGE });
      await logAuditEvent(currentUser, 'CHANGE_OWN_PASSWORD', `Password changed successfully for @${currentUser.username}`, currentUser.id, currentUser.username);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(onClose, 900);
    } catch (error) {
      setMessage({ type: 'error', text: FAILURE_MESSAGE });
      await logAuditEvent(currentUser, 'CHANGE_OWN_PASSWORD', `Password change failed for @${currentUser.username}`, currentUser.id, currentUser.username);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-[#4F6F8D] px-6 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <KeyRound className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[17px] font-black leading-tight">ប្តូរពាក្យសម្ងាត់</h3>
              <p className="mt-0.5 text-[13px] font-semibold text-white/80">Change Password</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-[14px] font-bold leading-relaxed text-blue-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <span>គណនីនេះអាចប្តូរបានតែពាក្យសម្ងាត់ផ្ទាល់ខ្លួនប៉ុណ្ណោះ។ / This changes only your own account password.</span>
          </div>

          {renderPasswordField(
            'current-password',
            'current',
            'ពាក្យសម្ងាត់បច្ចុប្បន្ន / Current Password',
            currentPassword,
            setCurrentPassword
          )}
          {renderPasswordField(
            'new-password',
            'next',
            'ពាក្យសម្ងាត់ថ្មី / New Password',
            newPassword,
            setNewPassword
          )}
          {renderPasswordField(
            'confirm-password',
            'confirm',
            'បញ្ជាក់ពាក្យសម្ងាត់ថ្មី / Confirm New Password',
            confirmPassword,
            setConfirmPassword
          )}

          {message && (
            <div className={`rounded-lg border px-4 py-3 text-[14px] font-bold leading-relaxed ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {message.text}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-slate-300 px-5 py-2.5 text-[14px] font-extrabold text-slate-700 hover:bg-slate-50"
              disabled={isSubmitting}
            >
              បោះបង់ / Cancel
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-[#353C96] px-5 py-2.5 text-[14px] font-black text-white shadow hover:bg-[#2D327F] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'កំពុងប្តូរ... / Changing...' : 'ប្តូរពាក្យសម្ងាត់ / Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
