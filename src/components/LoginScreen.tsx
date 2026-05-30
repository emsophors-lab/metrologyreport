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
    <div id="login-screen" className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative Traditional Khmer Background Gradients */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-navy/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gold/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl border border-slate-200 relative z-10">
        
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
            <div id="nmc-seal-icon-fallback" className="absolute inset-0 flex items-center justify-center bg-navy/10 rounded-xl p-3 h-16 w-16 mx-auto">
              <Landmark id="nmc-seal-icon" className="h-10 w-10 text-navy" />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest leading-relaxed">ព្រះរាជាណាចក្រកម្ពុជា</p>
          <p className="text-[10px] font-medium text-slate-400 -mt-1 tracking-widest mb-3">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
          
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h2>
          <p className="mt-1.5 text-sm text-slate-500 font-medium leading-relaxed">
            ប្រព័ន្ធគ្រប់គ្រងរបាយការណ៍ឧបករណ៍មាត្រាសាស្ត្រប្រចាំខែ
          </p>
          <div className="w-16 h-0.5 bg-gold mx-auto mt-3 rounded-full"></div>
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
                <User className="h-4 w-4 text-slate-400" />
              </div>
              <input
                id="username-input"
                name="username"
                type="text"
                required
                className="block w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                <KeyRound className="h-4 w-4 text-slate-400" />
              </div>
              <input
                id="password-input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                className="block w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-navy hover:bg-navy/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold cursor-pointer transition-all shadow-md shadow-navy/10 active:scale-95"
          >
            ចូលប្រព័ន្ធ / Sign In
          </button>
        </form>

        <div className="text-center text-[10px] text-slate-400 pt-2 selection:bg-amber-100">
          រក្សាសិទ្ធិគ្រប់យ៉ាង © ២០២៦ មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
        </div>
      </div>
    </div>
  );
}
