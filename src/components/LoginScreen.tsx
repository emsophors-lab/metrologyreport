import React, { useState } from 'react';
import { KeyRound, User, Landmark, Eye, EyeOff } from 'lucide-react';
import { MetrologyUser } from '../types';
import nmcLogo from './NMClogo.png';

interface LoginScreenProps {
  onLoginSuccess: (user: MetrologyUser) => void;
  usersList: MetrologyUser[];
}

export default function LoginScreen({ onLoginSuccess, usersList }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('សូមបំពេញឈ្មោះគណនី និងលេខសំងាត់របស់អ្នក!');
      return;
    }

    const matchedUser = usersList.find(
      (u) => u.username.toLowerCase() === username.toLowerCase().trim() && u.password === password
    );

    if (matchedUser) {
      setErrorMessage('');
      onLoginSuccess(matchedUser);
    } else {
      setErrorMessage('ឈ្មោះគណនី ឬ លេខសំងាត់មិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀត!');
    }
  };

  return (
    <div id="login-screen" className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative Traditional Khmer Background Gradients referencing precision scientific coordinates */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gold/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>
      
      {/* Dynamic measurement science grid background lines */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(30,58,138,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(30,58,138,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-2xl border border-slate-200/80 relative z-10 transition-all duration-300 hover:shadow-blue-900/5">
        
        {/* National Metrology Logo / Traditional Seal Header */}
        <div className="text-center">
          <div className="mx-auto max-h-24 max-w-[124px] flex items-center justify-center mb-4 scale-100 hover:scale-105 transition-transform duration-300 overflow-hidden relative">
            <img 
              src={nmcLogo} 
              alt="NMC National Logo" 
              className="h-16 w-auto object-contain hidden"
              onLoad={(e) => {
                e.currentTarget.classList.remove('hidden');
                const fallbackElement = document.getElementById('nmc-seal-icon-fallback');
                if (fallbackElement) {
                  fallbackElement.classList.add('hidden');
                }
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallbackElement = document.getElementById('nmc-seal-icon-fallback');
                if (fallbackElement) {
                  fallbackElement.classList.remove('hidden');
                }
              }} 
            />
            <div id="nmc-seal-icon-fallback" className="absolute inset-0 flex items-center justify-center bg-blue-50 rounded-xl p-3 h-16 w-16 mx-auto">
              <Landmark id="nmc-seal-icon" className="h-10 w-10 text-blue-900" />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest leading-relaxed">ព្រះរាជាណាចក្រកម្ពុជា</p>
          <p className="text-[10px] font-medium text-slate-400 -mt-1 tracking-widest mb-3">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
          
          <h2 className="text-lg font-bold text-slate-950 tracking-tight font-muol leading-relaxed">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h2>
          <p className="mt-1.5 text-xs text-slate-500 font-medium leading-relaxed">
            ប្រព័ន្ធគ្រប់គ្រងរបាយការណ៍ឧបករណ៍មាត្រាសាស្ត្រប្រចាំខែ
          </p>
          <div className="w-16 h-1 bg-gradient-to-r from-blue-900 via-gold to-blue-900 mx-auto mt-3 rounded-full"></div>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-md text-rose-700 text-xs font-medium leading-relaxed animate-pulse">
            {errorMessage}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleLogin}>
          
          {/* Username block */}
          <div>
            <label htmlFor="username-input" className="block text-xs font-semibold text-slate-700 mb-1.5 cursor-pointer">
              ឈ្មោះគណនីប្រើប្រាស់ (Username)
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-blue-900" />
              </div>
              <input
                id="username-input"
                name="username"
                type="text"
                required
                className="block w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-950 focus:border-blue-950 transition-colors"
                placeholder="ឧ. superadmin, company01"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          {/* Password block */}
          <div>
            <label htmlFor="password-input" className="block text-xs font-semibold text-slate-700 mb-1.5 cursor-pointer">
              លេខសម្ងាត់ (Password)
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound className="h-4 w-4 text-blue-900" />
              </div>
              <input
                id="password-input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                className="block w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-950 focus:border-blue-950 transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                id="toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            id="login-submit-button"
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-900 cursor-pointer transition-all shadow-md shadow-blue-900/10 active:scale-95"
          >
            ចូលប្រព័ន្ធ / Sign In
          </button>
        </form>

        <div className="text-center text-[10px] text-slate-400 pt-2 selection:bg-blue-150 font-muol leading-normal">
          រក្សាសិទ្ធិគ្រប់យ៉ាង © ២០២៦ មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
        </div>
      </div>
    </div>
  );
}
