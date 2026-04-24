import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helpers — never redirect to localhost
const PROD_URL = 'https://www.cvjob.cl';
const APP_URL = (typeof window !== 'undefined' && !window.location.hostname.includes('localhost'))
  ? window.location.origin
  : PROD_URL;

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: APP_URL },
  });

export const signInWithEmail = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUpWithEmail = (email: string, password: string, name: string) =>
  supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: APP_URL,
    },
  });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

export const resetPasswordForEmail = (email: string) =>
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_URL}?recovery=true`,
  });

export const updatePassword = (newPassword: string) =>
  supabase.auth.updateUser({ password: newPassword });
