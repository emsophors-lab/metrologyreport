import React, { useState } from 'react';
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

  // Technical Requirement: Paths for background and logo image as requested
  // "Replace the background image path with: YOUR_BACKGROUND_IMAGE.png"
  // "Replace the logo image path with: YOUR_LOGO_IMAGE.png"
  const BACKGROUND_IMAGE_PATH = "/login-illustration.png.png"; // fallback to actual provided image
  const LOGO_IMAGE_PATH = nmcLogo; // fallback to loaded NMC Logo image asset

  // Javascript / React handler to toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Login authentication and form submit handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Placeholder logic / validation
    if (!username.trim() || !password.trim()) {
      setErrorMessage('សូមបំពេញឈ្មោះគណនី និងលេខសំងាត់របស់អ្នក!');
      return;
    }

    const matchedUser = usersList.find(
      (u) => u.username.toLowerCase() === username.toLowerCase().trim() && u.password === password
    );

    if (matchedUser) {
      if (matchedUser.is_active === false) {
        setErrorMessage('គណនីរបស់លោកអ្នកត្រូវផ្អាកបណ្តោះអាសន្ន! / This account has been deactivated!');
        return;
      }
      setErrorMessage('');
      onLoginSuccess(matchedUser);
    } else {
      setErrorMessage('ឈ្មោះគណនី ឬ លេខសំងាត់មិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀត!');
    }
  };

  return (
    <div id="login-screen" className="nmc-login-page-container">
      
      {/* Dynamic Embedding of Custom Beautiful Vanilla CSS Styles without Tailwind dependency */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&family=Moul&family=Inter:wght@400;500;600;700&display=swap');

        .nmc-login-page-container {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          width: 100vw;
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          font-family: 'Battambang', Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #04091a;
          color: #ffffff;
        }

        /* Full Background Image Cover and Centered style */
        .nmc-bg-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: url('${BACKGROUND_IMAGE_PATH}');
          background-size: cover;
          background-position: center;
          z-index: 1;
        }

        /* Soft deep overlay of navy and absolute royal blue */
        .nmc-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, rgba(4, 9, 26, 0.92) 0%, rgba(8, 28, 77, 0.85) 50%, rgba(15, 52, 133, 0.75) 100%);
          z-index: 2;
        }

        /* Nested layout context */
        .nmc-layout {
          position: relative;
          z-index: 3;
          width: 100%;
          max-width: 1200px;
          min-height: 100vh;
          margin: 0 auto;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          padding: 40px;
          box-sizing: border-box;
        }

        @media (max-width: 991px) {
          .nmc-layout {
            flex-direction: column;
            justify-content: center;
            padding: 30px 20px;
            align-items: center;
          }
        }

        /* Left-side Welcome container */
        .nmc-welcome-area {
          flex: 1.1;
          padding-right: 50px;
          text-align: left;
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (max-width: 991px) {
          .nmc-welcome-area {
            flex: none;
            padding-right: 0;
            text-align: center;
            margin-bottom: 40px;
            max-width: 580px;
          }
        }

        .nmc-welcome-title {
          font-family: 'Moul', cursive;
          font-size: 2.5rem;
          line-height: 1.6;
          color: #ffffff;
          margin: 0 0 20px 0;
          text-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        }

        @media (max-width: 1200px) {
          .nmc-welcome-title {
            font-size: 2.1rem;
          }
        }

        @media (max-width: 991px) {
          .nmc-welcome-title {
            font-size: 1.7rem;
            margin-bottom: 12px;
          }
        }

        .nmc-welcome-text {
          font-size: 1.05rem;
          line-height: 1.9;
          color: #e2e8f0;
          text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          margin: 0;
        }

        @media (max-width: 991px) {
          .nmc-welcome-text {
            font-size: 0.92rem;
          }
        }

        /* Right Form wrapper container */
        .nmc-form-area {
          flex: 0.9;
          display: flex;
          justify-content: flex-end;
          width: 100%;
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards;
          opacity: 0;
        }

        @media (max-width: 991px) {
          .nmc-form-area {
            flex: none;
            justify-content: center;
            max-width: 440px;
          }
        }

        /* Glassmorphism Card Style */
        .nmc-glass-card {
          width: 100%;
          max-width: 420px;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px) saturate(190%);
          -webkit-backdrop-filter: blur(20px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 28px;
          padding: 38px 34px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.4);
          box-sizing: border-box;
          text-align: center;
          position: relative;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .nmc-glass-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 255, 255, 0.32);
          box-shadow: 0 26px 55px rgba(0, 0, 0, 0.5);
        }

        /* Cambodia Flag Top Banner Accent */
        .nmc-flag-line {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          display: flex;
          border-top-left-radius: 28px;
          border-top-right-radius: 28px;
          overflow: hidden;
        }

        .nmc-flag-red {
          flex: 1;
          background-color: #D21820;
        }

        .nmc-flag-blue {
          flex: 1;
          background-color: #032F83;
        }

        /* Header logo boxes */
        .nmc-card-logo-box {
          width: 86px;
          height: 86px;
          background-color: #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 6px auto 16px auto;
          padding: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
          border: 1.5px solid rgba(255, 255, 255, 0.9);
          transition: transform 0.3s ease;
        }

        .nmc-card-logo-box:hover {
          transform: scale(1.05);
        }

        .nmc-card-logo-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .nmc-card-title {
          font-family: 'Moul', cursive;
          font-size: 1.25rem;
          color: #ffffff;
          line-height: 1.5;
          margin: 0 0 20px 0;
          letter-spacing: 0.5px;
        }

        /* Form validation Alert box */
        .nmc-error-box {
          background-color: rgba(239, 68, 68, 0.22);
          border-left: 4px solid #ef4444;
          color: #fecaca;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 0.84rem;
          line-height: 1.5;
          margin-bottom: 20px;
          text-align: left;
          animation: slideInDown 0.3s ease-out;
        }

        /* Form groups */
        .nmc-form-g {
          margin-bottom: 18px;
          text-align: left;
        }

        .nmc-label-txt {
          font-size: 0.8rem;
          font-weight: bold;
          color: #cbd5e1;
          margin-bottom: 6px;
          display: block;
        }

        .nmc-field-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .nmc-left-icon {
          position: absolute;
          left: 14px;
          color: rgba(255, 255, 255, 0.55);
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .nmc-input-box {
          width: 100%;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 14px;
          padding: 14px 16px 14px 44px;
          font-size: 0.95rem;
          color: #ffffff;
          outline: none;
          box-sizing: border-box;
          transition: all 0.25s ease;
        }

        .nmc-input-box:focus {
          background: rgba(255, 255, 255, 0.14);
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
        }

        .nmc-input-box::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }

        .nmc-eye-btn {
          position: absolute;
          right: 14px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.55);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
          transition: color 0.2s ease;
        }

        .nmc-eye-btn:hover {
          color: #ffffff;
        }

        /* Checkbox designs */
        .nmc-check-row {
          display: flex;
          align-items: center;
          margin-bottom: 24px;
          text-align: left;
        }

        .nmc-check-lbl {
          display: flex;
          align-items: center;
          color: #cbd5e1;
          font-size: 0.88rem;
          cursor: pointer;
          user-select: none;
        }

        .nmc-chk-input {
          appearance: none;
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border: 1.5px solid rgba(255, 255, 255, 0.35);
          border-radius: 5px;
          margin-right: 8px;
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .nmc-chk-input:checked {
          background-color: #3b82f6;
          border-color: #3b82f6;
        }

        .nmc-chk-input:checked::before {
          content: "✓";
          color: #ffffff;
          font-size: 11px;
          font-weight: bold;
        }

        /* Action Primary button style */
        .nmc-action-btn {
          width: 100%;
          background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          color: #ffffff;
          font-size: 1rem;
          font-weight: bold;
          padding: 14px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(29, 78, 216, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.25s ease;
        }

        .nmc-action-btn:hover {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.45);
        }

        .nmc-action-btn:active {
          transform: scale(0.97);
        }

        /* Fine Gold divider line decoration */
        .nmc-gold-accent-line {
          height: 1.5px;
          background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.4) 50%, transparent);
          margin-top: 20px;
          width: 100%;
        }

        /* Footer */
        .nmc-footer-sec {
          text-align: center;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.45);
          margin-top: 24px;
          line-height: 1.5;
        }

        /* Animations */
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Covering background and translucent royal blue overlay */}
      <div className="nmc-bg-image"></div>
      <div className="nmc-overlay"></div>

      {/* Main Container Layout */}
      <div className="nmc-layout">
        
        {/* Left Side: Welcome Description section */}
        <div className="nmc-welcome-area">
          <h1 className="nmc-welcome-title">ប្រព័ន្ធរបាយការណ៍មាត្រាសាស្ត្រ</h1>
          <p className="nmc-welcome-text">
            ប្រព័ន្ធគ្រប់គ្រងសម្រាប់ការបំពេញ និងដាក់របាយការណ៍ស្តីពីការផលិត ការដំឡើង និងការជួសជុលឧបករណ៍មាត្រាសាស្ត្រ របស់ក្រុមហ៊ុនដែលមានអាជ្ញាបណ្ណ និងទទួលស្គាល់ផ្លូវការពីរដ្ឋ។
          </p>
        </div>

        {/* Right Side: Modern Glassmorphic Login card */}
        <div className="nmc-form-area" style={{ opacity: 1 /* override animation opacity default once layout loads */ }}>
          <div className="nmc-glass-card">
            
            {/* Elegant Cambodia flag accents line */}
            <div className="nmc-flag-line">
              <div className="nmc-flag-red"></div>
              <div className="nmc-flag-blue"></div>
            </div>

            {/* Logo and National Metrology title */}
            <div className="nmc-card-logo-box">
              <img 
                src={LOGO_IMAGE_PATH} 
                alt="National Metrology Center Logo" 
                className="nmc-card-logo-img"
              />
            </div>

            <h2 className="nmc-card-title">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h2>

            {/* Form submit response errors display box */}
            {errorMessage && (
              <div className="nmc-error-box">
                {errorMessage}
              </div>
            )}

            {/* Authenticate form */}
            <form onSubmit={handleLogin}>
              
              {/* Username text area */}
              <div className="nmc-form-g">
                <label className="nmc-label-txt" htmlFor="nmc-user-field">ឈ្មោះអ្នកប្រើប្រាស់ / Username</label>
                <div className="nmc-field-wrap">
                  <span className="nmc-left-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <input
                    id="nmc-user-field"
                    type="text"
                    required
                    placeholder="ឈ្មោះអ្នកប្រើប្រាស់"
                    className="nmc-input-box"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              {/* Password text area */}
              <div className="nmc-form-g">
                <label className="nmc-label-txt" htmlFor="nmc-pass-field">ពាក្យសម្ងាត់ / Password</label>
                <div className="nmc-field-wrap">
                  <span className="nmc-left-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="nmc-pass-field"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="ពាក្យសម្ងាត់"
                    className="nmc-input-box"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="nmc-eye-btn"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me box */}
              <div className="nmc-check-row">
                <label className="nmc-check-lbl">
                  <input type="checkbox" className="nmc-chk-input" defaultChecked />
                  <span>ចងចាំខ្ញុំ</span>
                </label>
              </div>

              {/* Primary action call button */}
              <button type="submit" className="nmc-action-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>ចូលប្រើប្រាស់ / Sign In</span>
              </button>

            </form>

            {/* Elegant decorations with fine gold highlight center lines */}
            <div className="nmc-gold-accent-line"></div>

            {/* Footnote information branding */}
            <div className="nmc-footer-sec">
              រក្សាសិទ្ធិ © ២០២៦ មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
