'use client';

import { useState } from 'react';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Eye, EyeOff, AlertCircle, ShieldAlert, User } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

function SignupInner() {
  const router = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    if (!email.trim() || !password.trim() || !fullName.trim()) {
      setError('Name, email, and password are required.');
      setLoading(false);
      return;
    }

    const supabase = createBrowserClient();
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        }
      }
    });

    if (authError) {
      const msg = (authError.message || 'Signup failed.').toLowerCase();
      if (msg.includes('signup') && msg.includes('disabled')) {
        setError(
          'New sign-ups are disabled on this Supabase project. A Manager must invite you — ' +
          'ask them to add your account via the admin console.'
        );
      } else if (msg.includes('registered') || msg.includes('already')) {
        setError('That email already has an account. Try signing in instead.');
      } else if (msg.includes('password')) {
        setError(authError.message + ' (Passwords must be at least 6 characters.)');
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    // Redirect to dashboard, which will handle the /api/setup automatically
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber mb-4">
            <Lock className="w-5 h-5 text-navy" />
          </div>
          <h1 className="text-white font-black text-xl tracking-tight">Matty&apos;s Place</h1>
          <p className="text-slate-400 text-xs mt-1">Staff Portal — Sign Up</p>
        </div>

        {/* Card */}
        <div className="bg-navy-light border border-navy-border rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-900/30 border border-red-700/40 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="signup-name" className="text-xxs font-black text-slate-400 uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  id="signup-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="John Doe"
                  className="w-full bg-navy border border-navy-border rounded-lg pl-9 pr-4 py-2.5
                             text-white text-sm placeholder-slate-600
                             focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber/50
                             transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="signup-email" className="text-xxs font-black text-slate-400 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-navy border border-navy-border rounded-lg pl-9 pr-4 py-2.5
                             text-white text-sm placeholder-slate-600
                             focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber/50
                             transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="signup-password" className="text-xxs font-black text-slate-400 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  id="signup-password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full bg-navy border border-navy-border rounded-lg pl-9 pr-10 py-2.5
                             text-white text-sm placeholder-slate-600
                             focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber/50
                             transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber text-navy font-black text-sm py-2.5 rounded-lg
                         hover:bg-amber-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Sign Up'}
            </button>

            <p className="text-xxs text-slate-500 text-center leading-relaxed">
              Staff accounts are invitation-only. Only pre-authorised admin
              emails can bootstrap themselves; everyone else needs a Manager
              to create their account.
            </p>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-amber hover:text-amber-light transition-colors font-bold">
            Sign In
          </Link>
        </p>

        <p className="text-center text-xxs text-slate-600 mt-6">
          Ash Shahada Housing Association Ltd · Matty&apos;s Place · Reliance Housing
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInner />
    </Suspense>
  );
}
