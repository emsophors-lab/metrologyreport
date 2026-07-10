import React, { useState, useEffect } from 'react';
import { MetrologyUser } from '../types';
import nmcLoginLogo from './NMClogo-standard.png';
import { getActiveSupabaseClient } from '../supabaseSync';
import { isDemoLoginAllowed, INITIAL_USERS } from '../demoData';
import { verifyUserPassword } from '../utils/passwordUtils';
import LoginMetrologyAnimation from './LoginMetrologyAnimation';

interface LoginScreenProps {
  onLoginSuccess: (user: MetrologyUser) => void;
  usersList: MetrologyUser[];
  isUsersLoading?: boolean;
}

export default function LoginScreen({ onLoginSuccess, usersList, isUsersLoading = false }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeTone, setNoticeTone] = useState<'error' | 'warning'>('error');
  const [showForgotNotice, setShowForgotNotice] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Technical Requirement: Paths for background and logo image as requested
  // "Replace the background image path with: YOUR_BACKGROUND_IMAGE.png"
  // "Replace the logo image path with: YOUR_LOGO_IMAGE.png"
  const BACKGROUND_IMAGE_PATH = "/login-illustration.png.png"; // fallback to actual provided image
  const LOGO_IMAGE_PATH = nmcLoginLogo; // standard NMC seal used on the login page

  // Javascript / React handler to toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const limitedConnectionNotice = 'ប្រព័ន្ធកំពុងដំណើរការក្នុងរបៀបមានកំណត់។ សូមពិនិត្យការតភ្ជាប់ ឬទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ។ / Limited connection mode. Please check your connection or contact the system administrator.';
  const setupNotice = 'ប្រព័ន្ធមិនទាន់មានគណនីអ្នកប្រើប្រាស់សម្រាប់ចូលប្រើ។ សូមទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ។ / User access is not ready. Please contact the system administrator.';

  const showLoginNotice = (message: string, tone: 'error' | 'warning' = 'error') => {
    setNoticeTone(tone);
    setErrorMessage(message);
  };

  const clearLoginNotice = () => {
    setErrorMessage('');
    setNoticeTone('error');
  };

  const logTechnicalIssue = (label: string, detail: unknown) => {
    if ((import.meta as any).env?.DEV) {
      console.warn(label, detail);
    }
  };

  // Server-authenticated actions (Telegram webhook setup, test-send) require a
  // Supabase Auth session token; a local users-table match alone is not enough.
  const establishServerAuthSession = async (
    client: NonNullable<ReturnType<typeof getActiveSupabaseClient>>,
    matchedUser: MetrologyUser,
    plainPassword: string
  ): Promise<boolean> => {
    const authEmail = matchedUser.email || `${matchedUser.username.toLowerCase()}@nmc.gov.kh`;

    let authResult = await client.auth.signInWithPassword({
      email: authEmail,
      password: plainPassword
    });

    if (authResult.error) {
      // Sign-in can fail because the auth account does not exist yet, is unconfirmed,
      // or has a stale password. The server verifies the users-table credentials and
      // creates/repairs the pre-confirmed Supabase Auth account, then we retry.
      logTechnicalIssue('Requesting server auth account provisioning for configured user:', matchedUser.username);
      try {
        const provisionResponse = await fetch('/api/provision-auth-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: matchedUser.username,
            password: plainPassword
          })
        });

        if (provisionResponse.ok) {
          const provisionData = await provisionResponse.json().catch(() => null);
          authResult = await client.auth.signInWithPassword({
            email: provisionData?.email || authEmail,
            password: plainPassword
          });
        } else {
          logTechnicalIssue('Server auth account provisioning rejected:', provisionResponse.status);
        }
      } catch (provisionErr) {
        logTechnicalIssue('Server auth account provisioning failed:', provisionErr);
      }
    }

    if (authResult.error || !authResult.data.session) {
      logTechnicalIssue('Server auth session unavailable, continuing with local session:', authResult.error);
      return false;
    }

    return true;
  };

  // Warning effect to handle Database Connection failed or empty fallbacks
  useEffect(() => {
    if (!isUsersLoading) {
      const client = getActiveSupabaseClient();
      const isDemoAllowed = isDemoLoginAllowed();
      const hasSupabase = !!client;
      const dbIsEmpty = usersList.length === 0;

      if (hasSupabase && dbIsEmpty) {
        if (isDemoAllowed) {
          showLoginNotice(limitedConnectionNotice, 'warning');
        } else {
          showLoginNotice(setupNotice, 'warning');
        }
      } else if (!hasSupabase) {
        if (isDemoAllowed) {
          showLoginNotice(limitedConnectionNotice, 'warning');
        }
      }
    }
  }, [isUsersLoading, usersList]);

  // Login authentication and form submit handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      showLoginNotice('សូមបំពេញឈ្មោះគណនី និងលេខសំងាត់របស់អ្នក!');
      return;
    }

    // Ensure users are loaded before login validation
    if (isUsersLoading) {
      showLoginNotice('កំពុងផ្ទុកគណនីអ្នកប្រើប្រាស់... សូមរង់ចាំមួយភ្លែត! / Loading user accounts... Please wait a moment!', 'warning');
      return;
    }

    setIsAuthenticating(true);
    clearLoginNotice();

    const inputUser = username.trim().toLowerCase();
    const inputPass = password;
    const isDemoAllowed = isDemoLoginAllowed();

    // Look up in the passed usersList (or INITIAL_USERS as a fallback if usersList is empty and demo is allowed)
    const effectiveUsers = (usersList && usersList.length > 0) 
      ? usersList 
      : (isDemoAllowed ? INITIAL_USERS : []);

    let localMatched: MetrologyUser | undefined;
    for (const candidate of effectiveUsers) {
      if (candidate.username.toLowerCase() === inputUser && await verifyUserPassword(inputPass, candidate)) {
        localMatched = candidate;
        break;
      }
    }

    try {
      const client = getActiveSupabaseClient();
      const hasSupabase = !!client;
      const dbIsEmpty = usersList.length === 0;

      if (isDemoAllowed && localMatched) {
        // If it's an allowed demo user, log them in directly in testing mode
        logTechnicalIssue('Development login path used:', localMatched.username);
        onLoginSuccess(localMatched);
        setIsAuthenticating(false);
        return;
      }

      // If we are in production and db is empty or supabase not there, show clear error
      if (!isDemoAllowed && (!hasSupabase || dbIsEmpty)) {
        showLoginNotice(setupNotice, 'warning');
        setIsAuthenticating(false);
        return;
      }

      if (localMatched) {
        if (localMatched.is_active === false) {
          showLoginNotice('គណនីរបស់លោកអ្នកត្រូវផ្អាកបណ្តោះអាសន្ន! / This account has been deactivated!');
          setIsAuthenticating(false);
          return;
        }

        if (client) {
          try {
            await establishServerAuthSession(client, localMatched, password);
          } catch (authErr) {
            logTechnicalIssue('Server auth session setup failed, continuing with local session:', authErr);
          }
        }

        clearLoginNotice();
        onLoginSuccess(localMatched);
        setIsAuthenticating(false);
        return;
      }

      if (client) {
        // Active Supabase connection configured! Use Production Supabase Auth.
        const usernameOrEmail = username.trim();
        let finalEmail = usernameOrEmail;
        if (!usernameOrEmail.includes('@')) {
          // Resolve email from user list username or fallback to domain prefix
          finalEmail = localMatched?.email || `${usernameOrEmail.toLowerCase()}@nmc.gov.kh`;
        }

        let authResult = await client.auth.signInWithPassword({
          email: finalEmail,
          password: password
        });

        // Smart onboarding experience: if this matches a default demo user and they don't exist in the custom Supabase Auth register, register them automatically!
        if (authResult.error && (
          authResult.error.message.includes('Invalid login credentials') || 
          authResult.error.message.includes('invalid_credentials') ||
          authResult.error.message.includes('Email not confirmed')
        )) {
          if (localMatched) {
            logTechnicalIssue('Attempting automatic auth profile registration for configured user:', localMatched.username);
            const { data: signUpData, error: signUpError } = await client.auth.signUp({
              email: finalEmail,
              password: password,
              options: {
                data: {
                  username: localMatched.username
                }
              }
            });

            if (!signUpError && signUpData.user) {
              const newUserRecord = {
                id: signUpData.user.id,
                license_number: localMatched.license_number,
                company_name_kh: localMatched.company_name_kh,
                company_name_en: localMatched.company_name_en,
                address: localMatched.address,
                phone: localMatched.phone,
                email: localMatched.email,
                legal_representative: localMatched.legal_representative,
                representative_position: localMatched.representative_position,
                username: localMatched.username,
                password: localMatched.password,
                password_hash: localMatched.password_hash || null,
                password_updated_at: localMatched.password_updated_at || null,
                must_change_password: localMatched.must_change_password ?? false,
                last_password_change_by: localMatched.last_password_change_by || null,
                role: localMatched.role,
                can_view: localMatched.can_view,
                can_edit: localMatched.can_edit,
                can_save: localMatched.can_save,
                can_delete: localMatched.can_delete,
                is_active: localMatched.is_active ?? true,
                created_at: localMatched.created_at || new Date().toISOString()
              };

              // Insert directly into the registered users profile table
              await client.from('users').upsert([newUserRecord]);

              // Attempt login once more
              authResult = await client.auth.signInWithPassword({
                email: finalEmail,
                password: password
              });
            }
          }
        }

        if (authResult.error) {
          logTechnicalIssue('Authentication provider error:', authResult.error);
          
          // Fallback to local demo login if we are in testing mode and get a Supabase Auth error
          if (isDemoAllowed && localMatched) {
            logTechnicalIssue('Development fallback login path used after auth provider rejection:', localMatched.username);
            onLoginSuccess(localMatched);
            setIsAuthenticating(false);
            return;
          }

          if (authResult.error.message.includes('Invalid login credentials') || authResult.error.message.includes('invalid_credentials')) {
            showLoginNotice('ឈ្មោះគណនី/អុីម៉ែល ឬ លេខសំងាត់មិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀត!');
          } else {
            showLoginNotice(limitedConnectionNotice, 'warning');
          }
          setIsAuthenticating(false);
          return;
        }

        if (authResult.data.user) {
          // Fetch authenticated profile details (using active 'users' table, NOT 'profiles')
          const { data: profile, error: pErr } = await client
            .from('users')
            .select('*')
            .eq('id', authResult.data.user.id)
            .single();

          if (pErr || !profile) {
            logTechnicalIssue('Profile loading error:', pErr);
            
            // If demo mode is allowed and it's a demo account, we can still fall back
            if (isDemoAllowed && localMatched) {
              onLoginSuccess(localMatched);
              setIsAuthenticating(false);
              return;
            }

            // Fallback user if profile table doesn't have it yet: construct from auth user details
            const defaultUser: MetrologyUser = {
              id: authResult.data.user.id,
              username: authResult.data.user.email?.split('@')[0] || 'user',
              email: authResult.data.user.email || '',
              role: 'company',
              company_name_kh: 'ក្រុមហ៊ុនសហគ្រាសសេវាកម្ម',
              company_name_en: 'Service Enterprise',
              license_number: 'NMC-LICENSE',
              address: 'Phnom Penh, Cambodia',
              phone: '000000000',
              legal_representative: 'Legal Representative',
              representative_position: 'Director',
              can_view: true,
              can_edit: true,
              can_save: true,
              can_delete: true,
              created_at: new Date().toISOString()
            };
            onLoginSuccess(defaultUser);
          } else {
            if (profile.is_active === false) {
              showLoginNotice('គណនីរបស់លោកអ្នកត្រូវផ្អាកបណ្តោះអាសន្ន! / This account has been deactivated!');
              setIsAuthenticating(false);
              return;
            }
            
            // Map table values back to MetrologyUser format
            const mappedUser: MetrologyUser = {
              id: profile.id,
              username: profile.username,
              email: profile.email,
              role: profile.role,
              company_name_kh: profile.company_name_kh || 'ក្រុមហ៊ុនសហគ្រាសសេវាកម្ម',
              company_name_en: profile.company_name_en || 'Service Enterprise',
              license_number: profile.license_number || 'NMC-LICENSE',
              address: profile.address || 'Cambodia',
              phone: profile.phone || '',
              legal_representative: profile.legal_representative || '',
              representative_position: profile.representative_position || '',
              can_view: profile.can_view ?? true,
              can_edit: profile.can_edit ?? true,
              can_save: profile.can_save ?? true,
              can_delete: profile.can_delete ?? true,
              admin_can_add_company_user: profile.admin_can_add_company_user ?? false,
              admin_can_add_admin_user: profile.admin_can_add_admin_user ?? false,
              admin_can_edit_users: profile.admin_can_edit_users ?? false,
              admin_can_deactivate_users: profile.admin_can_deactivate_users ?? false,
              admin_can_view_all_users: profile.admin_can_view_all_users ?? false,
              password_hash: profile.password_hash || null,
              password_updated_at: profile.password_updated_at || null,
              must_change_password: profile.must_change_password ?? false,
              last_password_change_by: profile.last_password_change_by || null,
              is_active: profile.is_active ?? true,
              created_at: profile.created_at || new Date().toISOString()
            };
            onLoginSuccess(mappedUser);
          }
        }
      } else {
        // Fallback Database offline simulations if not configured
        if (localMatched) {
          if (localMatched.is_active === false) {
            showLoginNotice('គណនីរបស់លោកអ្នកត្រូវផ្អាកបណ្តោះអាសន្ន! / This account has been deactivated!');
            setIsAuthenticating(false);
            return;
          }
          clearLoginNotice();
          onLoginSuccess(localMatched);
        } else {
          showLoginNotice('ឈ្មោះគណនី ឬ លេខសំងាត់មិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀត!');
        }
      }
    } catch (err: any) {
      logTechnicalIssue('Login verification exception:', err);
      if (isDemoAllowed && localMatched) {
        logTechnicalIssue('Development fallback login path used after auth exception:', localMatched.username);
        onLoginSuccess(localMatched);
        setIsAuthenticating(false);
        return;
      }
      showLoginNotice(limitedConnectionNotice, 'warning');
    } finally {
      setIsAuthenticating(false);
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
          font-family: 'Battambang', 'Khmer OS Siemreap', 'Khmer OS Battambang', 'Noto Sans Khmer', Arial, sans-serif;
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
          background: linear-gradient(135deg, rgba(10, 22, 48, 0.96) 0%, rgba(31, 42, 68, 0.9) 50%, rgba(47, 82, 110, 0.82) 100%);
          z-index: 2;
        }

        /* Nested layout context */
        .nmc-layout {
          position: relative;
          z-index: 3;
          width: 100%;
          max-width: 1200px;
          min-height: 100svh;
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
            justify-content: flex-start;
            gap: 22px;
            padding: 24px 18px;
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

        .nmc-welcome-copy {
          max-width: 760px;
          padding: 24px 28px 26px 26px;
          margin: 0 0 24px 0;
          border-left: 4px solid rgba(212, 175, 55, 0.78);
          border-bottom: 1px solid rgba(212, 175, 55, 0.22);
          border-radius: 0 20px 20px 0;
          background: linear-gradient(110deg, rgba(5, 15, 35, 0.62) 0%, rgba(8, 24, 52, 0.46) 62%, rgba(8, 24, 52, 0.16) 100%);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
        }

        /* Official MISTI / NMC branding header */
        .nmc-official-header {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          margin-bottom: 22px;
          padding: 12px 18px 13px 18px;
          border-bottom: 3px solid #D4AF37;
          border-radius: 2px;
          background: linear-gradient(90deg, rgba(11, 26, 53, 0.96), rgba(6, 43, 95, 0.82));
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.22);
        }

        .nmc-official-ministry {
          font-family: 'Battambang', 'Khmer OS Siemreap', 'Khmer OS Battambang', 'Noto Sans Khmer', Arial, sans-serif;
          font-size: 1rem;
          line-height: 1.65;
          font-weight: 800;
          color: #f3d98b;
          text-shadow: none;
          margin: 0;
        }

        @media (max-width: 991px) {
          .nmc-official-header {
            margin-bottom: 14px;
            padding: 10px 14px;
          }

          .nmc-official-ministry {
            font-size: 0.88rem;
          }

        }

        /* Metrology animation panel wrapper */
        .nmc-metrology-visual {
          margin-top: 24px;
          width: 100%;
        }

        @media (max-width: 991px) {
          .nmc-metrology-visual {
            margin-top: 14px;
          }
        }

        /* System name tagline under the animation */
        .nmc-system-tagline {
          margin-top: 12px;
          text-align: center;
        }

        .nmc-system-tagline-kh {
          font-size: 1rem;
          font-weight: 800;
          color: rgba(243, 217, 139, 0.94);
          margin: 0;
          line-height: 1.7;
        }

        .nmc-system-tagline-en {
          font-family: 'Inter', Arial, sans-serif;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.9px;
          color: rgba(226, 232, 240, 0.62);
          margin: 4px 0 0 0;
        }

        @media (max-width: 991px) {
          .nmc-system-tagline-kh {
            font-size: 0.9rem;
          }

          .nmc-system-tagline-en {
            font-size: 0.72rem;
          }
        }

        @media (max-width: 991px) {
          .nmc-welcome-area {
            flex: none;
            padding-right: 0;
            text-align: center;
            margin-bottom: 0;
            max-width: 580px;
          }

          .nmc-welcome-copy {
            padding: 18px 18px 20px 18px;
            margin-bottom: 16px;
            border-left-width: 0;
            border-bottom: 2px solid rgba(212, 175, 55, 0.48);
            border-radius: 18px;
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
            font-size: 1.55rem;
            line-height: 1.45;
            margin-bottom: 10px;
          }
        }

        .nmc-welcome-text {
          font-size: 1.12rem;
          line-height: 1.9;
          color: #e2e8f0;
          text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          margin: 0;
        }

        @media (max-width: 991px) {
          .nmc-welcome-text {
            font-size: 1rem;
            line-height: 1.7;
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
          border-radius: 24px;
          padding: 30px 32px;
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

        /* Official navy/gold top rule */
        .nmc-flag-line {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 5px;
          display: flex;
          border-top-left-radius: 24px;
          border-top-right-radius: 24px;
          overflow: hidden;
          background: linear-gradient(90deg, #0B1A35 0%, #D4AF37 42%, #F2C94C 50%, #D4AF37 58%, #0B2E5E 100%);
        }

        .nmc-flag-red {
          width: 32%;
          background: transparent;
        }

        .nmc-flag-blue {
          flex: 1;
          background: transparent;
        }

        /* Header logo boxes */
        .nmc-card-logo-box {
          width: 86px;
          height: 86px;
          background: transparent;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 2px auto 12px auto;
          padding: 0;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
          border: 1px solid rgba(212, 175, 55, 0.38);
          transition: transform 0.3s ease;
        }

        .nmc-card-logo-box:hover {
          transform: scale(1.05);
        }

        .nmc-card-logo-img {
          width: 82px;
          height: 82px;
          object-fit: contain;
          border-radius: 50%;
          display: block;
        }

        .nmc-card-seal-caption {
          margin: -4px 0 18px 0;
          text-align: center;
        }

        .nmc-card-seal-caption-kh {
          margin: 0;
          font-family: 'Battambang', 'Khmer OS Siemreap', 'Khmer OS Battambang', 'Noto Sans Khmer', Arial, sans-serif;
          font-size: 1rem;
          font-weight: 800;
          line-height: 1.8;
          color: #ffffff;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
        }

        .nmc-card-seal-caption-en {
          margin: 3px 0 0 0;
          font-family: 'Inter', Arial, sans-serif;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.9px;
          text-transform: uppercase;
          color: rgba(243, 217, 139, 0.88);
        }

        /* Form validation Alert box */
        .nmc-error-box {
          background-color: rgba(239, 68, 68, 0.22);
          border-left: 4px solid #ef4444;
          color: #fecaca;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 0.95rem;
          line-height: 1.5;
          margin-bottom: 16px;
          text-align: left;
          animation: slideInDown 0.3s ease-out;
        }

        .nmc-error-box.warning {
          background-color: rgba(212, 175, 55, 0.16);
          border-left-color: #D4AF37;
          color: #FDE68A;
          box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.2);
        }

        /* Form groups */
        .nmc-form-g {
          margin-bottom: 14px;
          text-align: left;
        }

        .nmc-label-txt {
          font-size: 1rem;
          font-weight: bold;
          color: #cbd5e1;
          margin-bottom: 8px;
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
          min-height: 52px;
          padding: 12px 16px 12px 46px;
          font-size: 1.08rem;
          color: #ffffff;
          outline: none;
          box-sizing: border-box;
          transition: all 0.25s ease;
        }

        .nmc-input-box:focus {
          background: rgba(255, 255, 255, 0.14);
          border-color: #39789A;
          box-shadow: 0 0 0 3px rgba(57, 120, 154, 0.25);
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
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
          text-align: left;
        }

        .nmc-check-lbl {
          display: flex;
          align-items: center;
          color: #cbd5e1;
          font-size: 1rem;
          cursor: pointer;
          user-select: none;
        }

        .nmc-chk-input {
          appearance: none;
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
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
          background-color: #39789A;
          border-color: #39789A;
        }

        .nmc-chk-input:checked::before {
          content: "✓";
          color: #ffffff;
          font-size: 13px;
          font-weight: bold;
        }

        .nmc-forgot-link {
          border: 0;
          background: transparent;
          padding: 0;
          color: #f3d98b;
          font-family: 'Battambang', 'Noto Sans Khmer', Arial, sans-serif;
          font-size: 0.92rem;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          transition: color 0.2s ease, text-shadow 0.2s ease;
          white-space: nowrap;
        }

        .nmc-forgot-link:hover,
        .nmc-forgot-link:focus-visible {
          color: #ffffff;
          text-shadow: 0 0 14px rgba(212, 175, 55, 0.55);
          outline: none;
        }

        /* Action Primary button style */
        .nmc-action-btn {
          width: 100%;
          background: linear-gradient(135deg, #0B1A35 0%, #062B5F 58%, #0B2E5E 100%);
          border: 1px solid rgba(212, 175, 55, 0.45);
          border-top: 3px solid #D4AF37;
          border-radius: 14px;
          color: #ffffff;
          font-size: 1.12rem;
          font-weight: bold;
          min-height: 54px;
          padding: 12px 15px;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(6, 43, 95, 0.42);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.25s ease;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
        }

        .nmc-action-btn:hover {
          background: linear-gradient(135deg, #0E2347 0%, #0B2E5E 55%, #123C73 100%);
          border-color: rgba(242, 201, 76, 0.72);
          box-shadow: 0 8px 24px rgba(6, 43, 95, 0.52), 0 0 0 1px rgba(212, 175, 55, 0.18);
        }

        .nmc-action-btn:focus-visible {
          outline: 3px solid rgba(242, 201, 76, 0.45);
          outline-offset: 3px;
        }

        .nmc-action-btn:active {
          transform: scale(0.97);
        }

        /* Fine Gold divider line decoration */
        .nmc-gold-accent-line {
          height: 1.5px;
          background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.4) 50%, transparent);
          margin-top: 18px;
          width: 100%;
        }

        /* Footer */
        .nmc-footer-sec {
          text-align: center;
          font-size: 0.86rem;
          color: rgba(255, 255, 255, 0.45);
          margin-top: 18px;
          line-height: 1.65;
        }

        .nmc-footer-copyright {
          margin: 0;
          color: rgba(255, 255, 255, 0.72);
          font-weight: 700;
        }

        .nmc-footer-english,
        .nmc-footer-hierarchy,
        .nmc-footer-version {
          margin: 4px 0 0 0;
        }

        .nmc-footer-english {
          font-family: 'Inter', Arial, sans-serif;
          font-size: 0.72rem;
          color: rgba(226, 232, 240, 0.6);
        }

        .nmc-footer-hierarchy {
          color: rgba(243, 217, 139, 0.68);
          font-size: 0.76rem;
        }

        .nmc-footer-version {
          font-family: 'Inter', Arial, sans-serif;
          font-size: 0.7rem;
          color: rgba(226, 232, 240, 0.48);
        }

        .nmc-forgot-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(3, 7, 18, 0.64);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .nmc-forgot-modal {
          width: min(430px, 100%);
          border-radius: 18px;
          border: 1px solid rgba(212, 175, 55, 0.28);
          background: linear-gradient(145deg, rgba(11, 26, 53, 0.98), rgba(6, 43, 95, 0.96));
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.46);
          padding: 24px;
          color: #ffffff;
          text-align: left;
        }

        .nmc-forgot-modal h3 {
          margin: 0 0 10px 0;
          font-family: 'Battambang', 'Noto Sans Khmer', Arial, sans-serif;
          font-size: 1.05rem;
          font-weight: 800;
          line-height: 1.7;
          color: #f3d98b;
        }

        .nmc-forgot-modal p {
          margin: 0;
          color: rgba(226, 232, 240, 0.86);
          line-height: 1.8;
          font-size: 0.98rem;
        }

        .nmc-forgot-close {
          margin-top: 18px;
          width: 100%;
          min-height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(212, 175, 55, 0.5);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-weight: 800;
          cursor: pointer;
        }

        .nmc-forgot-close:hover,
        .nmc-forgot-close:focus-visible {
          background: rgba(212, 175, 55, 0.18);
          outline: none;
        }

        @media (max-width: 640px) {
          .nmc-layout {
            padding: 18px 14px;
            gap: 16px;
          }

          .nmc-welcome-title {
            font-size: 1.34rem;
          }

          .nmc-welcome-text {
            font-size: 0.94rem;
          }

          .nmc-form-area {
            max-width: 420px;
          }

          .nmc-glass-card {
            padding: 24px 24px;
            border-radius: 22px;
          }

          .nmc-card-logo-box {
            width: 74px;
            height: 74px;
            margin-bottom: 10px;
          }

          .nmc-card-logo-img {
            width: 70px;
            height: 70px;
          }

          .nmc-error-box {
            font-size: 0.9rem;
            padding: 9px 12px;
            margin-bottom: 14px;
          }

          .nmc-label-txt,
          .nmc-check-lbl {
            font-size: 0.96rem;
          }

          .nmc-check-row {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }

          .nmc-forgot-link {
            white-space: normal;
            text-align: left;
          }

          .nmc-input-box {
            min-height: 50px;
            font-size: 1rem;
          }

          .nmc-action-btn {
            min-height: 52px;
            font-size: 1.04rem;
          }

          .nmc-footer-sec {
            font-size: 0.82rem;
          }
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
        
        {/* Left Side: Official branding, welcome text and metrology animation */}
        <div className="nmc-welcome-area">

          {/* Official MISTI / NMC header */}
          <div className="nmc-official-header">
            <p className="nmc-official-ministry">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
          </div>

          <div className="nmc-welcome-copy">
            <h1 className="nmc-welcome-title">ប្រព័ន្ធរបាយការណ៍មាត្រាសាស្ត្រ</h1>
            <p className="nmc-welcome-text">
              ប្រព័ន្ធគ្រប់គ្រងសម្រាប់ការបំពេញ និងដាក់របាយការណ៍ស្តីពីការផលិត ការដំឡើង និងការជួសជុលឧបករណ៍មាត្រាសាស្ត្រ របស់ក្រុមហ៊ុនដែលមានអាជ្ញាបណ្ណ និងទទួលស្គាល់ផ្លូវការពីរដ្ឋ។
            </p>
          </div>

          {/* Animated metrology visual panel (decorative, CSS/SVG only) */}
          <div className="nmc-metrology-visual">
            <LoginMetrologyAnimation />
            <div className="nmc-system-tagline">
              <p className="nmc-system-tagline-kh">ប្រព័ន្ធរបាយការណ៍អាជ្ញាបណ្ណមាត្រាសាស្ត្រឌីជីថល</p>
              <p className="nmc-system-tagline-en">Digital Metrology License Report System</p>
            </div>
          </div>
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

            <div className="nmc-card-seal-caption">
              <p className="nmc-card-seal-caption-kh">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
              <p className="nmc-card-seal-caption-en">National Metrology Center of Cambodia</p>
            </div>

            {/* Form submit response errors display box */}
            {isUsersLoading && (
              <div className="nmc-loading-box" style={{ padding: '12px', background: 'rgba(217, 119, 6, 0.15)', border: '1px solid #d97706', borderRadius: '10px', color: '#ffd700', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <span style={{ display: 'inline-block' }}>🌀</span>
                <span>កំពុងផ្ទុកគណនីអ្នកប្រើប្រាស់... / Loading user accounts...</span>
              </div>
            )}

            {errorMessage && (
              <div className={`nmc-error-box ${noticeTone === 'warning' ? 'warning' : ''}`}>
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
                <button
                  type="button"
                  className="nmc-forgot-link"
                  onClick={() => setShowForgotNotice(true)}
                >
                  ភ្លេចពាក្យសម្ងាត់? / Forgot password?
                </button>
              </div>

              {/* Primary action call button */}
              <button type="submit" className="nmc-action-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>ចូលប្រើប្រាស់ / Login</span>
              </button>

            </form>

            {/* Elegant decorations with fine gold highlight center lines */}
            <div className="nmc-gold-accent-line"></div>

            {/* Footnote information branding */}
            <div className="nmc-footer-sec">
              <p className="nmc-footer-copyright">រក្សាសិទ្ធិ © ២០២៦ មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
              <p className="nmc-footer-english">All rights reserved © 2026 National Metrology Center of Cambodia</p>
              <p className="nmc-footer-hierarchy">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍ → មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ → នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម</p>
              <p className="nmc-footer-version">MISTI → NMC → Department of Industrial Metrology · Version 1.0</p>
            </div>

          </div>
        </div>

      </div>

      {showForgotNotice && (
        <div
          className="nmc-forgot-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nmc-forgot-title"
          onClick={() => setShowForgotNotice(false)}
        >
          <div className="nmc-forgot-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="nmc-forgot-title">ភ្លេចពាក្យសម្ងាត់?</h3>
            <p>
              សូមទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ ដើម្បីស្នើសុំកំណត់ពាក្យសម្ងាត់ឡើងវិញ។
              <br />
              Please contact the system administrator to reset your password.
            </p>
            <button
              type="button"
              className="nmc-forgot-close"
              onClick={() => setShowForgotNotice(false)}
            >
              យល់ព្រម / OK
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
