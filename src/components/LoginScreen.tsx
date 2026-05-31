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
    <div id="login-screen" className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#CAD6E2] via-[#E9F0F5] to-[#BACEDC] p-4 md:p-12 relative overflow-hidden select-none">
      {/* Ambient radial blur glows for visual richness */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-white/20 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-100/30 rounded-full blur-3xl pointer-events-none translate-x-1/3 translate-y-1/3"></div>

      <div className="max-w-6xl w-full flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-24 relative z-10">
        
        {/* Column 1: App Info (Left Side - visible on medium and larger screens) */}
        <div className="hidden md:flex flex-col items-start text-left max-w-md md:max-w-lg space-y-6">
          {/* Pills badge */}
          <div className="bg-white/40 border border-white/60 px-4 py-2 rounded-full text-slate-800 text-xs font-semibold backdrop-blur-sm inline-flex items-center gap-2 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            National Metrology Center
          </div>

          {/* Brand Main Title styled exactly with elegant Khmer and gorgeous shadow glow */}
          <div className="space-y-1">
            <h1 className="text-white text-5xl lg:text-6xl font-extrabold leading-normal select-none font-sans drop-shadow-[0_8px_24px_rgba(30,58,138,0.25)] text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-800">
              ប្រព័ន្ធរបាយការណ៍
            </h1>
            <h1 className="text-white text-5xl lg:text-6xl font-extrabold leading-normal select-none font-sans drop-shadow-[0_8px_24px_rgba(30,58,138,0.25)] text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-800">
              មាត្រាសាស្ត្រ
            </h1>
          </div>

          {/* Subtitle description */}
          <p className="text-slate-700/90 text-sm md:text-base leading-relaxed select-none font-medium">
            សម្រាប់ក្រុមហ៊ុនដែលទទួលបានអាជ្ញាបណ្ណ បំពេញរបាយការណ៍ការផលិត ដំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ។
          </p>
        </div>

        {/* Column 2: The Elegant Card (Right Side) */}
        <div className="w-full max-w-[460px] bg-white rounded-[32px] shadow-[0_25px_60px_-15px_rgba(30,58,138,0.2)] border border-white/80 p-8 md:p-10 relative overflow-hidden transition-all duration-300 hover:shadow-[0_30px_70px_rgba(30,58,138,0.25)] flex flex-col">
          {/* Top Split Cambodia Flag Color bar line */}
          <div className="absolute top-0 inset-x-0 h-1.5 flex">
            <div className="w-1/2 bg-[#D32F2F]"></div>
            <div className="w-1/2 bg-[#1565C0]"></div>
          </div>

          <div className="text-center flex flex-col items-center">
            {/* Logo circle container */}
            <div className="w-24 h-24 bg-white rounded-full shadow-lg border border-slate-100/80 flex items-center justify-center p-1.5 mb-5 scale-100 hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <img 
                src={nmcLogo} 
                alt="NMC Logo" 
                className="h-16 w-auto object-contain hidden"
                onLoad={(e) => {
                  e.currentTarget.classList.remove('hidden');
                  const fallbackElement = document.getElementById('nmc-logo-badge-fallback');
                  if (fallbackElement) {
                    fallbackElement.classList.add('hidden');
                  }
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallbackElement = document.getElementById('nmc-logo-badge-fallback');
                  if (fallbackElement) {
                    fallbackElement.classList.remove('hidden');
                  }
                }} 
              />
              <div id="nmc-logo-badge-fallback" className="absolute inset-0 flex items-center justify-center bg-blue-50/50 rounded-full p-2 h-16 w-16 mx-auto my-auto border border-blue-100">
                <Landmark className="h-9 w-9 text-blue-900" />
              </div>
            </div>

            {/* Texts below Logo */}
            <p className="text-xs font-semibold text-slate-850 uppercase tracking-widest leading-relaxed">ព្រះរាជាណាចក្រកម្ពុជា</p>
            <p className="text-[10px] font-medium text-slate-500 tracking-widest mb-3">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
            
            <h2 className="text-2xl font-bold text-[#0D47A1] leading-relaxed drop-shadow-sm font-sans">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h2>
            <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
              ប្រព័ន្ធគ្រប់គ្រងរបាយការណ៍សេវាមាត្រាសាស្ត្រ
            </p>

            {/* Elegant gold-blue gradient divider */}
            <div className="w-28 h-[3px] bg-gradient-to-r from-amber-400 via-[#1565C0] to-amber-400 mx-auto mt-4 rounded-full shadow-sm"></div>
          </div>

          {/* Error message slot */}
          {errorMessage && (
            <div className="mt-5 bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-lg text-rose-700 text-xs font-medium leading-relaxed animate-pulse">
              {errorMessage}
            </div>
          )}

          {/* The Form */}
          <form className="mt-7 space-y-5" onSubmit={handleLogin}>
            
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username-input" className="block text-xs font-semibold text-slate-700 cursor-pointer">
                ឈ្មោះគណនីប្រើប្រាស់ (Username)
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-4.5 w-4.5 text-blue-800" />
                </div>
                <input
                  id="username-input"
                  name="username"
                  type="text"
                  required
                  className="block w-full pl-11 pr-4 py-3 bg-slate-50/60 border border-slate-200 rounded-xl text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#1565C0] transition-all duration-200 placeholder-slate-400"
                  placeholder="ឧ. superadmin, company01"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password-input" className="block text-xs font-semibold text-slate-700 cursor-pointer">
                លេខសម្ងាត់ (Password)
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <KeyRound className="h-4.5 w-4.5 text-blue-800" />
                </div>
                <input
                  id="password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="block w-full pl-11 pr-10 py-3 bg-slate-50/60 border border-slate-200 rounded-xl text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#1565C0] transition-all duration-200 placeholder-slate-400"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  id="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center text-xs py-1">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer hover:text-slate-800 transition-colors">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-300 text-[#1565C0] focus:ring-[#1565C0] h-4 w-4 cursor-pointer" 
                />
                <span>ចងចាំខ្ញុំ</span>
              </label>
            </div>

            {/* Large Action Sign In Button */}
            <button
              type="submit"
              id="login-submit-button"
              className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#1565C0] to-[#0D47A1] hover:from-[#0D47A1] hover:to-[#0A2F6C] focus:outline-none focus:ring-4 focus:ring-blue-100 cursor-pointer transition-all duration-350 shadow-[0_12px_24px_rgba(21,101,192,0.3)] active:scale-[0.98]"
            >
              ចូលប្រើប្រាស់ / Sign In
            </button>
          </form>

          {/* Small Footer Copyright inside Card */}
          <div className="text-center text-[10px] text-slate-400/90 pt-8 mt-auto font-medium select-none">
            រក្សាសិទ្ធិ © ២០២៦ មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
          </div>
        </div>

      </div>
    </div>
  );
}
