import React, { useState, useEffect } from 'react';
import { UserPlus, Edit2, Trash2, CheckCircle, Shield, Key, Eye, EyeOff, X, Send, FileDown, Printer, MapPin, CalendarDays, FileText } from 'lucide-react';
import { MetrologyUser, UserRole } from '../types';
import { exportUsersToWordDoc, getMonthNameKH } from '../exportUtils';

interface UserManagementProps {
  currentUser: MetrologyUser;
  usersList: MetrologyUser[];
  onSaveUser: (user: MetrologyUser) => void;
  onDeleteUser: (userId: string) => void;
  toastMsg: (msg: string, type: 'success' | 'error') => void;
}

export default function UserManagement({
  currentUser,
  usersList,
  onSaveUser,
  onDeleteUser,
  toastMsg,
}: UserManagementProps) {
  // Form fields
  const [userId, setUserId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [companyNameKh, setCompanyNameKh] = useState('');
  const [companyNameEn, setCompanyNameEn] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [legalRepresentative, setLegalRepresentative] = useState('');
  const [representativePosition, setRepresentativePosition] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('company');
  
  // Permissions
  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [canSave, setCanSave] = useState(true);
  const [canDelete, setCanDelete] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Telegram Notifications State Settings
  const [telegramBotToken, setTelegramBotToken] = useState(() => localStorage.getItem('nmc_telegram_bot_token') || '');
  const [telegramChatId, setTelegramChatId] = useState(() => localStorage.getItem('nmc_telegram_chat_id') || '');
  const [telegramEnabled, setTelegramEnabled] = useState(() => localStorage.getItem('nmc_telegram_enabled') !== 'false');
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);

  const handleSaveTelegramConfig = () => {
    localStorage.setItem('nmc_telegram_bot_token', telegramBotToken.trim());
    localStorage.setItem('nmc_telegram_chat_id', telegramChatId.trim());
    localStorage.setItem('nmc_telegram_enabled', telegramEnabled ? 'true' : 'false');
    toastMsg('បានរក្សាទុកការកំណត់ Telegram ដោយជោគជ័យ!', 'success');
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      toastMsg('សូមបំពេញ Bot Token និង Chat ID មុនពេលសាកល្បង!', 'error');
      return;
    }
    setIsTestingTelegram(true);
    try {
      const response = await fetch(`https://api.telegram.org/bot${telegramBotToken.trim()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId.trim(),
          text: `🔔 <b>NMC Telegram Test Connection</b>\n\nប្រព័ន្ធគ្រប់គ្រងរបាយការណ៍ NMC ត្រូវបានតភ្ជាប់ដោយជោគជ័យជាមួយ Telegram! ពេលវេលាផ្ទៀងផ្ទាត់៖ ${new Date().toLocaleString()}`,
          parse_mode: 'HTML'
        })
      });
      const data = await response.json();
      if (data.ok) {
        toastMsg('សាកល្បងជោគជ័យ! សារសាកល្បងត្រូវបានបញ្ជូនទៅកាន់ Telegram Host App ។', 'success');
      } else {
        toastMsg(`បរាជ័យ៖ ${data.description || 'កូដខុស ឬ Chat ID មិនត្រឹមត្រូវ'}`, 'error');
      }
    } catch (err: any) {
      toastMsg(`បរាជ័យក្នុងការតភ្ជាប់៖ ${err.message}`, 'error');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // Default Password dynamically follows License Number if empty
  useEffect(() => {
    if (!isEditing && licenseNumber && !password) {
      setPassword(licenseNumber);
    }
  }, [licenseNumber, isEditing, password]);

  const clearForm = () => {
    setUserId('');
    setLicenseNumber('');
    setCompanyNameKh('');
    setCompanyNameEn('');
    setAddress('');
    setPhone('');
    setEmail('');
    setLegalRepresentative('');
    setRepresentativePosition('');
    setUsername('');
    setPassword('');
    setUserRole('company');
    setCanView(true);
    setCanEdit(true);
    setCanSave(true);
    setCanDelete(true);
    setIsEditing(false);
  };

  const handleSelectUser = (user: MetrologyUser) => {
    setUserId(user.id);
    setLicenseNumber(user.license_number);
    setCompanyNameKh(user.company_name_kh);
    setCompanyNameEn(user.company_name_en);
    setAddress(user.address);
    setPhone(user.phone);
    setEmail(user.email);
    setLegalRepresentative(user.legal_representative);
    setRepresentativePosition(user.representative_position);
    setUsername(user.username);
    setPassword(user.password || '');
    setUserRole(user.role);
    setCanView(user.can_view);
    setCanEdit(user.can_edit);
    setCanSave(user.can_save);
    setCanDelete(user.can_delete);
    setIsEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !companyNameKh.trim()) {
      toastMsg('សូមបំពេញព័ត៌មានកាតព្វកិច្ច (ឈ្មោះសហគ្រាស និង Username)', 'error');
      return;
    }

    // Only superadmin can create/manage users with higher roles, but admin can make standard companies
    if (currentUser.role !== 'superadmin' && userRole === 'superadmin') {
      toastMsg('អ្នកមិនមានសិទ្ធិបង្កើតគណនី Super Admin បានទេ!', 'error');
      return;
    }

    // Check duplicate username if writing a new user
    const usernameExist = usersList.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.id !== userId
    );

    if (usernameExist) {
      toastMsg('ឈ្មោះគណនី (Username) នេះមានរួចរាល់ហើយក្នុងប្រព័ន្ធ!', 'error');
      return;
    }

    const newUser: MetrologyUser = {
      id: userId || 'user_' + Date.now(),
      license_number: licenseNumber || 'N/A',
      company_name_kh: companyNameKh,
      company_name_en: companyNameEn || 'N/A',
      address: address || 'N/A',
      phone: phone || 'N/A',
      email: email || 'N/A',
      legal_representative: legalRepresentative || 'N/A',
      representative_position: representativePosition || 'N/A',
      username: username.trim(),
      password: password || licenseNumber || '123456',
      role: userRole,
      can_view: canView,
      can_edit: canEdit,
      can_save: canSave,
      can_delete: canDelete,
      created_at: new Date().toISOString(),
    };

    onSaveUser(newUser);
    clearForm();
  };

  const handleDelete = (idToDelete: string) => {
    if (idToDelete === currentUser.id) {
      toastMsg('អ្នកមិនអាចលុបគណនីផ្ទាល់ខ្លួនដែលកំពុងប្រើប្រាស់បានទេ!', 'error');
      return;
    }
    
    const confirmDelete = window.confirm('តើអ្នកពិតជាចង់លុបគណនីទិន្នន័យក្រុមហ៊ុន ឬមន្ត្រីនេះចេញពីប្រព័ន្ធមែនទេ?');
    if (confirmDelete) {
      onDeleteUser(idToDelete);
      toastMsg('បានលុបគណនីដោយជោគជ័យប្រព័ន្ធ!', 'success');
      if (userId === idToDelete) {
        clearForm();
      }
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const term = searchQuery.toLowerCase();
    const locTerm = filterLocation.toLowerCase();
    
    // Check main search fields
    const matchesMain = (
      u.company_name_kh.toLowerCase().includes(term) ||
      u.company_name_en.toLowerCase().includes(term) ||
      u.license_number.toLowerCase().includes(term) ||
      u.username.toLowerCase().includes(term) ||
      u.legal_representative.toLowerCase().includes(term)
    );

    // Filter by Location property
    const matchesLoc = locTerm ? (u.address || '').toLowerCase().includes(locTerm) : true;

    // Filter by Date (created_at date part matches filterDate if provided)
    let matchesDate = true;
    if (filterDate) {
      const userDateStr = u.created_at ? u.created_at.split('T')[0] : '';
      matchesDate = userDateStr === filterDate;
    }

    return matchesMain && matchesLoc && matchesDate;
  });

  return (
    <div id="user-management-section" className="space-y-6">
      
      {/* Upper Grid: Entry Form and Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Form panel */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
            <UserPlus className="h-5 w-5 text-gold" />
            <h3 className="text-base font-bold text-slate-800">
              {isEditing ? 'កែប្រែព័ត៌មានគណនីក្រុមហ៊ុន/មន្ត្រី' : 'ចុះឈ្មោះបង្កើតគណនីថ្មី'}
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* License Number block */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  លេខអាជ្ញាប័ណ្ណសហគ្រាស
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. LIC-2026-098"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                />
              </div>

              {/* User role */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ប្រភេទគណនី (User Role)
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                >
                  <option value="company">សហគ្រាស/ក្រុមហ៊ុនអាជ្ញាប័ណ្ណ (Company)</option>
                  <option value="admin">មន្ត្រីត្រួតពិនិត្យ (NMC Admin)</option>
                  {currentUser.role === 'superadmin' && (
                    <option value="superadmin">Super Admin (អ្នកគ្រប់គ្រងជាន់ខ្ពស់)</option>
                  )}
                </select>
              </div>

              {/* Company Name Khmer */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ឈ្មោះសហគ្រាស (ភាសាខ្មែរ) *
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. ក្រុមហ៊ុនទទួលបានអាជ្ញាប័ណ្ណ មាត្រាសាស្ត្រកម្ពុជា"
                  value={companyNameKh}
                  onChange={(e) => setCompanyNameKh(e.target.value)}
                />
              </div>

              {/* Company Name English */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ឈ្មោះសហគ្រាស (ភាសាអង់គ្លេស)
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. Cambodia Metrology Licensing Co., Ltd"
                  value={companyNameEn}
                  onChange={(e) => setCompanyNameEn(e.target.value)}
                />
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  អាសយដ្ឋានសហគ្រាស
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. ផ្លូវលេខ ៣០ ភូមិ១ សង្កាត់ទឹកល្អក់ទី២ ខណ្ឌទួលគោក ភ្នំពេញ"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  លេខទូរស័ព្ទសហគ្រាស
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. 012 345 678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  អ៊ីម៉ែលទាក់ទង
                </label>
                <input
                  type="email"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. license@company.com.kh"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Legal Representative */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ឈ្មោះអ្នកតំណាងស្របច្បាប់
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. លោក សុខ ជា"
                  value={legalRepresentative}
                  onChange={(e) => setLegalRepresentative(e.target.value)}
                />
              </div>

              {/* Representative position */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  តួនាទីអ្នកតំណាងស្របច្បាប់
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. អគ្គនាយក ឬ នាយកប្រតិបត្តិ"
                  value={representativePosition}
                  onChange={(e) => setRepresentativePosition(e.target.value)}
                />
              </div>

              {/* Account Credentials divider */}
              <div className="md:col-span-2 border-t border-slate-200 pt-3 mt-1">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                  <Key className="h-3.5 w-3.5 text-gold" />
                  គណនីចូលប្រព័ន្ធ (Credentials for Logging in)
                </p>
              </div>

              {/* Username input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ឈ្មោះគណនីចូល (Username) *
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. ly_company"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              {/* Password input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  លេខសម្ងាត់សម្រាប់គណនី (Password)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 pr-10 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                    placeholder="លំនាំដើម៖ តាមលេខអាជ្ញាប័ណ្ណ"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Permissions system (Checkboxes) as requested */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-bold text-slate-800 mb-2">
                កំណត់សិទ្ធិប្រតិបត្តិការងារ (Permissions Role Setup)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-gold focus:ring-gold h-4 w-4"
                    checked={canView}
                    onChange={(e) => setCanView(e.target.checked)}
                  />
                  សិទ្ធិមើលភារកិច្ច (View)
                </label>
                
                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-gold focus:ring-gold h-4 w-4"
                    checked={canEdit}
                    onChange={(e) => setCanEdit(e.target.checked)}
                  />
                  សិទ្ធិកែប្រែ (Edit)
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-gold focus:ring-gold h-4 w-4"
                    checked={canSave}
                    onChange={(e) => setCanSave(e.target.checked)}
                  />
                  សិទ្ធិរក្សាទុក (Save)
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-gold focus:ring-gold h-4 w-4"
                    checked={canDelete}
                    onChange={(e) => setCanDelete(e.target.checked)}
                  />
                  សិទ្ធិលុបព័ត៌មាន (Delete)
                </label>
              </div>
            </div>

            {/* Custom action buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={clearForm}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                សម្អាតទម្រង់ (Clear)
              </button>
              
              {isEditing && (
                <button
                  type="button"
                  onClick={() => handleDelete(userId)}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  លុបគណនី (Delete User)
                </button>
              )}
              
              <button
                type="submit"
                className="px-5 py-2 bg-navy hover:bg-navy/90 text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer active:scale-95"
              >
                {isEditing ? 'រក្សាទុកការកែប្រែ (Update User)' : 'ចុះឈ្មោះភ្លាមៗ (Save User)'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Sidebar Column with both Telegram Settings and Guidance */}
        <div className="space-y-6">
          {/* Telegram Notification Settings Card */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-3">
              <Send className="h-4 w-4 text-sky-500 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-800">ការកំណត់ Telegram Notification</h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
              ប្រព័ន្ធនឹងបញ្ជូនរបាយការណ៍ជា PDF និងព័ត៌មានលម្អិតទៅ Telegram របស់លោកអ្នករាល់ពេលមានប្រតិបត្តិការបញ្ជូន ឬកែប្រែរបាយការណ៍។
            </p>
            <div className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-750 mb-1">Telegram Bot Token</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                  placeholder="ឧ. 123456789:ABCdef-..."
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-750 mb-1">Telegram Chat ID</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                  placeholder="ឧ. -1001234567890"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-2">
                <span className="text-xs text-slate-600 font-semibold select-none">
                  បើកដំណើរការ (Enable Notify)
                </span>
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-sky-500 focus:ring-sky-450 h-4 w-4 cursor-pointer"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={isTestingTelegram}
                  className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 focus:outline-none disabled:opacity-50 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isTestingTelegram ? 'សាកល្បង...' : 'សាកល្បង (Test)'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveTelegramConfig}
                  className="w-full py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  រក្សាទុក (Save)
                </button>
              </div>
            </div>
          </div>

          {/* Informational Guidance sidebar card */}
          <div className="bg-navy text-slate-100 rounded-xl p-6 flex flex-col justify-between shadow-md border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/15 rounded-full blur-2xl"></div>
            <div>
              <div className="h-10 w-10 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center mb-4">
                <Shield className="h-5 w-5 text-gold" />
              </div>
              <h4 className="text-sm font-bold text-gold mb-2">គោលការណ៍ត្រួតពិនិត្យសន្តិសុខទិន្នន័យ</h4>
              <p className="text-xs text-slate-300 leading-relaxed space-y-2">
                ដើម្បីរក្សាភាពត្រឹមត្រូវនៃស្ថិតិរបាយការណ៍សរុបប្រចាំជាតិ ៖
              </p>
              <ul className="text-xs text-slate-300 list-disc list-inside space-y-2 mt-2 leading-relaxed">
                <li>គណនីជា <b>សហគ្រាស (Company)</b> អាចតែងតាំងដោយការកែប្រែសិទ្ធិកម្រិត View, Save, Edit, or Delete ។</li>
                <li>រាល់ពេលបង្កើតសហគ្រាសថ្មី លេខសំងាត់ដំបូងនឹងត្រូវបានបង្កើតឡើងថតចម្លង (Default) ដោយស្វ័យប្រវត្តិតាម <b>លេខអាជ្ញាប័ណ្ណ</b> ។</li>
                <li>មានតែមន្ត្រីជាន់ខ្ពស់ <b>Super Admin</b> ប៉ុណ្ណោះដែលអាចលុបគណនី Admin ដទៃទៀតបាន។</li>
              </ul>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-800 text-[10px] text-slate-400 leading-relaxed">
              ណែនាំ៖ សម្រាប់ផលិតកម្ម (Production) គួរប្រើប្រាស់សេវាផ្ទៀងផ្ទាត់ផ្លូវការ Supabase Auth ដើម្បីការពារលេខសម្ងាត់បានកាន់តែប្រសើរខ្ពស់។
            </div>
          </div>
        </div>
      </div>

      {/* Users Database list */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
        {/* Advanced Filters Header */}
        <div className="p-5 border-b border-slate-150 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-gold" />
                បញ្ជីគណនីសហគ្រាស និងមន្ត្រីទាំងអស់ ({filteredUsers.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">ស្វែងរក ចម្រោះតាមទីតាំង/ថ្ងៃចុះឈ្មោះ និងទាញយកជារបាយការណ៍ផ្លូវការ</p>
            </div>
            
            {/* Download/Print Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportUsersToWordDoc(filteredUsers)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-slate-250 cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5 text-blue-600" />
                នាំចេញជា Word (.doc)
              </button>
              
              <button
                type="button"
                onClick={() => setShowPrintPreview(true)}
                className="px-3.5 py-1.5 bg-navy hover:bg-navy/95 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
              >
                <Printer className="h-3.5 w-3.5 text-gold" />
                បោះពុម្ពបញ្ជី (Print PDF)
              </button>
            </div>
          </div>

          {/* Filtering Fields Row (3 columns grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {/* General search query */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-500 mb-1 tracking-wide uppercase">
                ស្វែងរកទូទៅ (ឈ្មោះសហគ្រាស លេខអាជ្ញាប័ណ្ណ...)
              </label>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                placeholder="ស្វែងរកតាមឈ្មោះ គណនី តំណាង..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filter by Location (Address) */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-500 mb-1 tracking-wide uppercase">
                ស្វែងរកតាមទីតាំងសហគ្រាស (Enterprise Location)
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  placeholder="ឧ. ភ្នំពេញ, ខណ្ឌទួលគោក, ផ្លូវ..."
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                />
                <MapPin className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* Filter by Registration Date */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 tracking-wide uppercase">
                ចម្រោះតាមថ្ងៃបង្កើត (Registered Date)
              </label>
              <div className="relative">
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
                <CalendarDays className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          {/* Reset Filters helper if any search criteria is entered */}
          {(searchQuery || filterLocation || filterDate) && (
            <div className="flex items-center justify-between bg-amber-50 rounded-lg p-2 border border-amber-100">
              <span className="text-[11px] text-amber-800 font-medium">
                កំពុងអនុវត្តលក្ខខណ្ឌចម្រោះគណនីសហគ្រាស។ គណនីរកឃើញ៖ <strong>{filteredUsers.length}</strong> គណនី។
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterLocation('');
                  setFilterDate('');
                }}
                className="text-[11px] text-amber-900 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
                សម្អាតចម្រោះទាំងអស់ (Reset)
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 text-center w-12">ល.រ</th>
                <th className="p-4">ឈ្មោះសហគ្រាស និងលេខអាជ្ញាប័ណ្ណ</th>
                <th className="p-4">អ្នកតំណាង / ទំនាក់ទំនង</th>
                <th className="p-4">គណនី / ប្រភេទអ្នកប្រើ</th>
                <th className="p-4 text-center">សិទ្ធិ (Permissions)</th>
                <th className="p-4 text-center w-20">សកម្មភាព</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredUsers.map((u, i) => (
                <tr
                  key={u.id}
                  className={`hover:bg-slate-50/70 transition-colors ${userId === u.id ? 'bg-amber-500/5' : ''}`}
                >
                  <td className="p-4 text-center font-mono text-slate-400">{i + 1}</td>
                  <td className="p-4">
                    <div className="font-bold text-slate-800 leading-snug">{u.company_name_kh}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{u.company_name_en}</div>
                    <div className="inline-block bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[10px] font-mono mt-1.5">
                      អាជ្ញាប័ណ្ណ៖ {u.license_number}
                    </div>
                  </td>
                  <td className="p-4 space-y-1 text-left">
                    <div className="font-semibold text-slate-700">{u.legal_representative} <span className="text-slate-400 font-normal text-[10px]">({u.representative_position})</span></div>
                    <div className="text-[10px] text-slate-500 font-mono">{u.phone} • {u.email}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">{u.address}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-mono text-slate-600 font-medium">@{u.username}</div>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 ${
                        u.role === 'superadmin'
                          ? 'bg-amber-100 text-amber-700'
                          : u.role === 'admin'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {u.role === 'superadmin' ? 'Superadmin' : u.role === 'admin' ? 'NMC Admin' : 'Company'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap items-center justify-center gap-1 max-w-xs mx-auto">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${u.can_view ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-300'}`}>
                        View
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${u.can_save ? 'bg-emerald-50 text-emerald-600 border border-emerald-500/10' : 'bg-slate-150 text-slate-300'}`}>
                        Save
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${u.can_edit ? 'bg-blue-50 text-blue-600 border border-blue-500/10' : 'bg-slate-150 text-slate-300'}`}>
                        Edit
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${u.can_delete ? 'bg-rose-50 text-rose-600 border border-rose-500/10' : 'bg-slate-150 text-slate-300'}`}>
                        Delete
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        title="កែសម្រួលគណនី"
                        onClick={() => handleSelectUser(u)}
                        className="p-1 px-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="លុបគណនី"
                        onClick={() => handleDelete(u.id)}
                        className="p-1 px-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-sans font-medium">
                    មិនមានទិន្នន័យគណនីស្របគ្នានឹងការស្វែងរករបស់អ្នកឡើយ!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Print Preview and PDF Print Modal for the licensee enterprise database directory */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto print:p-0 print:bg-white print:absolute">
          <div className="bg-slate-950 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-full print:bg-white print:shadow-none print:rounded-none">
            {/* Modal Control Bar (hidden in print) */}
            <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between print:hidden shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-gold animate-bounce" />
                <div className="text-left">
                  <h4 className="font-bold text-white text-sm">ផ្ទាំងទស្សនាជាមុនសម្រាប់បោះពុម្ព (Print Preview Panel)</h4>
                  <p className="text-[11px] text-slate-400">អ្នកអាចបោះពុម្ព ឬរក្សាទុកបញ្ជីឈ្មោះសហគ្រាសខាងក្រោមជាឯកសារ PDF</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-gold hover:bg-gold/90 text-navy text-xs font-black rounded-lg transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer font-bold"
                >
                  <Printer className="h-4 w-4" />
                  បោះពុម្ពជារបាយការណ៍ / Print PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintPreview(false)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="បិទផ្ទាំង (Close)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Scrollable A4 Sheet content */}
            <div className="overflow-y-auto p-4 md:p-8 bg-slate-800 flex-1 flex justify-center print:bg-white print:p-0">
              <div id="printable-area" className="w-full max-w-4xl bg-white text-slate-950 p-6 md:p-10 shadow-lg rounded-md print:shadow-none print:rounded-none print:p-0 text-left">
                {/* State header crown */}
                <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-6">
                  <div className="font-sans text-left">
                    <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wide">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
                    <p className="text-xs font-bold text-indigo-900 underline mt-0.5">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">ទម្រង់លក្ខណៈឯកសារផ្លូវការរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
                  </div>
                  <div className="text-center font-sans text-right">
                    <h1 className="text-xs font-bold tracking-widest text-slate-900">ព្រះរាជាណាចក្រកម្ពុជា</h1>
                    <p className="text-[10px] font-bold text-slate-800 tracking-wider mt-0.5">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">❖ ❖ ❖</p>
                  </div>
                </div>

                {/* Title */}
                <div className="text-center mb-6">
                  <h2 className="text-sm font-black text-slate-900">បញ្ជីឈ្មោះគណនីសហគ្រាស និងមន្ត្រីទាំងអស់ (NMC)</h2>
                  <p className="text-[10px] text-slate-500 font-medium italic mt-0.5">(NMC Metrology Licensee Enterprises and Officiary Metadata Directory)</p>
                  <p className="text-[9px] text-slate-600 mt-1.5 font-mono">
                    កាលបរិច្ឆេទបញ្ជូនចេញ៖ {new Date().toLocaleDateString('km-KH')} {new Date().toLocaleTimeString('km-KH')}
                  </p>
                </div>

                {/* Filters info shown if filters are active */}
                {(searchQuery || filterLocation || filterDate) && (
                  <div className="mb-4 text-[9.5px] bg-slate-50 border border-slate-200 rounded p-2 text-slate-700 text-left">
                    <strong>លក្ខខណ្ឌចម្រោះគណនីសហគ្រាស៖</strong> {searchQuery && `ស្វែងរក៖ "${searchQuery}"`} {filterLocation && ` • ទីតាំងសហគ្រាស៖ "${filterLocation}"`} {filterDate && ` • កាលបរិច្ឆេទបង្កើត៖ ${filterDate}`}
                  </div>
                )}

                {/* Print Table */}
                <table className="w-full border-collapse border border-slate-350 text-[10px] text-slate-900 text-left font-sans">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-350 text-[9px] font-bold text-slate-800">
                      <th className="border border-slate-350 p-2 text-center w-10">ល.រ</th>
                      <th className="border border-slate-350 p-2 text-left">ឈ្មោះសហគ្រាស / សេចក្តីលម្អិត</th>
                      <th className="border border-slate-350 p-2 text-center w-28">លេខអាជ្ញាប័ណ្ណ</th>
                      <th className="border border-slate-350 p-2 text-left">អ្នកតំណាងស្របច្បាប់</th>
                      <th className="border border-slate-350 p-2 text-left">ទូរស័ព្ទ / អ៊ីម៉ែល</th>
                      <th className="border border-slate-350 p-1.5 text-left">អាសយដ្ឋាន</th>
                      <th className="border border-slate-350 p-2 text-center w-20">ប្រភេទសិទ្ធិ</th>
                      <th className="border border-slate-350 p-2 text-center w-24">កាលបរិច្ឆេទបង្កើត</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="border border-slate-350 p-6 text-center text-slate-500 font-sans">
                          មិនមានទិន្នន័យគណនីសហគ្រាសស្របគ្នានឹងលក្ខខណ្ឌជ្រើសរើសរបស់អ្នកឡើយ។
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u, i) => (
                        <tr key={u.id} className="border-b border-slate-350 bg-white">
                          <td className="border border-slate-350 p-2 text-center font-mono">{i + 1}</td>
                          <td className="border border-slate-350 p-2 font-bold font-sans">
                            <div>{u.company_name_kh}</div>
                            <div className="text-[8px] text-slate-500 font-mono mt-0.5">{u.company_name_en}</div>
                          </td>
                          <td className="border border-slate-350 p-2 text-center font-bold font-mono">
                            {u.license_number}
                          </td>
                          <td className="border border-slate-350 p-2 font-sans">
                            <div className="font-semibold">{u.legal_representative}</div>
                            <div className="text-[8px] text-slate-500 mt-0.5">({u.representative_position})</div>
                          </td>
                          <td className="border border-slate-350 p-2 font-mono text-left">
                            {u.phone} <br />
                            <span className="text-[8.5px] text-slate-500">{u.email}</span>
                          </td>
                          <td className="border border-slate-350 p-2 text-slate-700 text-[9px] font-sans">
                            {u.address}
                          </td>
                          <td className="border border-slate-350 p-2 text-center uppercase font-mono text-[8.5px]">
                            {u.role === 'superadmin' ? 'Superadmin' : u.role === 'admin' ? 'Admin' : 'Company'}
                          </td>
                          <td className="border border-slate-350 p-2 text-center font-mono text-[8.5px]">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString('km-KH') : 'N/A'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Print Signatures */}
                <div className="mt-12 flex justify-between text-left font-sans text-xs">
                  <div className="w-1/2">
                    <p className="text-[11px] font-bold text-slate-900 border-b border-slate-200 pb-0.5 inline-block">បានឃើញ និងផ្ទៀងផ្ទាត់</p>
                    <p className="text-[10px] text-slate-600 mt-1 font-semibold">ប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
                    <div className="mt-20">
                      <p className="text-[11px] text-slate-300">...............................................................</p>
                      <p className="text-[10px] font-bold text-slate-800 mt-1">(ហត្ថលេខា និងត្រាបង្គោល)</p>
                    </div>
                  </div>
                  <div className="w-1/2 text-right flex flex-col items-end">
                    <p className="text-[10px] text-slate-500 italic">ថ្ងៃទី {new Date().getDate()} ខែ {getMonthNameKH(String(new Date().getMonth() + 1).padStart(2, '0'))} ឆ្នាំ {new Date().getFullYear()}</p>
                    <p className="text-[10px] font-bold text-slate-900 mt-1">អ្នករៀបចំទិន្នន័យបញ្ជីឈ្មោះ</p>
                    <div className="mt-20 w-full flex flex-col items-end">
                      <p className="text-[11px] text-slate-300">...............................................................</p>
                      <p className="text-[10px] font-bold text-slate-800 mt-1 mr-4">(ហត្ថលេខា និងឈ្មោះមន្ត្រី)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
