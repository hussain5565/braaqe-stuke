import { createClient } from '@supabase/supabase-js';

// انتبه: يفضل دائماً استخدام متغيرات البيئة (Environment Variables) في المشاريع الحقيقية
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://lyfhzuxxfppkpdsopthl.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Zmh6dXh4ZnBwa3Bkc29wdGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDk4NDYsImV4cCI6MjA5MjAyNTg0Nn0.URdxCNXzNyn6W6g5R2grCKoOGH7yjqAqXgfq_SCB5ac';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// وظيفة تسجيل الدخول بالبريد (أو اسم المستخدم admin) وكلمة المرور
export const loginWithEmail = async (email: string, password: string) => {
  let targetEmail = email;
  
  // تحويل "admin" إلى بريد إلكتروني داخلي متوافق مع Supabase
  if (email.toLowerCase() === 'admin') {
    targetEmail = 'admin@buraq.local';
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: targetEmail,
    password,
  });

  // إذا لم يكن حساب admin موجوداً، نقوم بإنشائه تلقائياً لتسهيل العملية للمستخدم
  if (error && error.message.includes('Invalid login credentials') && email.toLowerCase() === 'admin') {
     const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: 'admin@buraq.local',
      password: 'admin12345',
      options: {
        data: {
          full_name: 'مدير النظام',
        }
      }
    });
    if (signUpError) throw signUpError;
    return signUpData;
  }

  if (error) throw error;
  return data;
};

// وظيفة إنشاء حساب جديد بالبريد وكلمة المرور
export const signUpWithEmail = async (email: string, password: string, fullName: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      }
    }
  });
  if (error) throw error;
  return data;
};

// وظيفة تسجيل الدخول بالمصادقة الخارجية (Google)
export const loginWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) throw error;
  return data;
};

export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// وظيفة الحصول على بيانات الجلسة الحالية
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};
