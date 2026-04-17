/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell 
} from 'recharts';
import { 
  Search, TrendingUp, TrendingDown, Info, AlertTriangle, 
  ArrowRight, ArrowLeft, Loader2, Newspaper, Target, 
  LineChart as ChartIcon, Activity, ChevronRight,
  Lock, Mail, User as UserIcon, X
} from 'lucide-react';
import { format, subMonths, startOfDay } from 'date-fns';
import { GoogleGenAI } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { loginWithGoogle, logout, supabase, loginWithEmail, signUpWithEmail } from './supabase';
import { User } from '@supabase/supabase-js';
import { StockQuote, HistoricalData, NewsItem, AIAnalysis } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COMMON_STOCKS = [
  { label: "اختبار الاتصال (TEST)", value: "TEST", market: "US", tv: "TEST" },
  // Saudi (TASI)
  { label: "الراجحي (1120)", value: "1120.SR", market: "TASI", tv: "TADAWUL:1120" },
  { label: "أرامكو (2222)", value: "2222.SR", market: "TASI", tv: "TADAWUL:2222" },
  { label: "سابك (2010)", value: "2010.SR", market: "TASI", tv: "TADAWUL:2010" },
  { label: "إس تي سي (7010)", value: "7010.SR", market: "TASI", tv: "TADAWUL:7010" },
  { label: "الأهلي (1180)", value: "1180.SR", market: "TASI", tv: "TADAWUL:1180" },
  // US
  { label: "Apple (AAPL)", value: "AAPL", market: "US", tv: "NASDAQ:AAPL" },
  { label: "Nvidia (NVDA)", value: "NVDA", market: "US", tv: "NASDAQ:NVDA" },
  { label: "Tesla (TSLA)", value: "TSLA", market: "US", tv: "NASDAQ:TSLA" },
  { label: "Microsoft (MSFT)", value: "MSFT", market: "US", tv: "NASDAQ:MSFT" },
  { label: "Google (GOOGL)", value: "GOOGL", market: "US", tv: "NASDAQ:GOOGL" },
];

// Utility for safe date formatting
function safeFormat(date: any, formatStr: string) {
  try {
    if (!date) return '---';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '---';
    return format(d, formatStr);
  } catch (e) {
    return '---';
  }
}

export default function App() {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<any>(null);

  useEffect(() => {
    console.log("App mounted");
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Ignore cross-origin script errors as they are usually non-fatal 
      // and prevented from displaying details anyway.
      if (event.message === 'Script error.' || !event.message) {
         console.warn("Caught cross-origin Script error or empty message - suppressing UI crash.");
         return;
      }
      
      // Filter out common harmless internal errors
      if (event.message.includes('ResizeObserver') || event.message.includes('supabase')) {
        console.warn("Suppressed minor internal error:", event.message);
        return;
      }
      
      console.error("GLOBAL ERROR CAUGHT:", event.error || event.message);
      setHasError(true);
      setErrorInfo(event.error || { message: event.message || "عطل غير معروف في النظام" });
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-bg text-text-main flex flex-col items-center justify-center p-8 text-center" dir="rtl">
        <AlertTriangle className="w-16 h-16 text-accent-red mb-6" />
        <h1 className="text-2xl font-bold mb-4">عذراً، حدث خطأ غير متوقع</h1>
        <p className="text-text-muted mb-8 max-w-md leading-relaxed">
          حدث خلل أثناء تشغيل المنصة. يرجى التأكد من إعدادات الاتصال أو المحاولة مرة أخرى لاحقاً.
        </p>
        <pre className="bg-accent-red/10 border border-accent-red/30 p-4 rounded text-xs font-mono text-accent-red mb-8 max-w-full overflow-auto">
          {errorInfo?.message || "Unknown Error"}
        </pre>
        <button 
          onClick={() => window.location.reload()}
          className="bg-accent-blue text-white px-6 py-3 font-bold hover:bg-accent-blue/80 transition-colors rounded"
        >
          إعادة تحميل الصفحة
        </button>
      </div>
    );
  }

  return <Dashboard />;
}

// TradingView Widget Component
function TradingViewWidget({ tvSymbol }: { tvSymbol: string }) {
  if (!tvSymbol || tvSymbol === 'TEST') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface border border-dashed border-border-custom rounded-xl p-12 text-center">
        <div>
          <Activity className="w-12 h-12 text-accent-blue mx-auto mb-4 opacity-30" />
          <p className="text-text-muted font-mono uppercase tracking-widest text-xs opacity-50">لا يوجد رسم بياني للمعاينة</p>
        </div>
      </div>
    );
  }

  // Use the standard TradingView embed URL with forced dark theme and Arabic locale
  const chartUrl = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSymbol)}&theme=dark&locale=ar&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=131722&timezone=Asia/Riyadh`;

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-border-custom bg-[#131722]">
      <iframe
        key={tvSymbol}
        src={chartUrl}
        title={`TradingView Chart - ${tvSymbol}`}
        className="w-full h-full border-none"
        allow="autoplay; encrypted-media"
        allowFullScreen
      />
    </div>
  );
}

function Dashboard() {
  const [symbol, setSymbol] = useState("1120.SR");
  const [market, setMarket] = useState<"TASI" | "US">("TASI");
  const [tvSymbol, setTvSymbol] = useState("TADAWUL:1120");
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [history, setHistory] = useState<HistoricalData[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Initialize Gemini safely
  const ai = useMemo(() => {
    // In AI Studio, the key is typically injected as process.env.GEMINI_API_KEY
    // But we check multiple common locations to be safe.
    const key = process.env.GEMINI_API_KEY || 
                (window as any).GEMINI_API_KEY || 
                (import.meta as any).env.VITE_GEMINI_API_KEY;
    
    if (!key || key.length < 10 || key === 'MY_GEMINI_API_KEY' || key === 'undefined') {
      console.warn("AI Warning: GEMINI_API_KEY is not detected or invalid.");
      return null;
    }
    return new GoogleGenAI({ apiKey: key });
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'login') {
        await loginWithEmail(authEmail, authPassword);
      } else {
        if (!authFullName) throw new Error("يرجى إدخال الاسم الكامل");
        await signUpWithEmail(authEmail, authPassword, authFullName);
      }
      setIsAuthModalOpen(false);
    } catch (err: any) {
      setAuthError(err.message || "حدث خطأ في عملية المصادقة");
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchData = async (s: string) => {
    if (!s) return;
    setLoading(true);
    setError(null);

    // Minor warning instead of blocking error for static hosts
    const isStaticHost = window.location.hostname.includes('web.app') || window.location.hostname.includes('firebaseapp.com');

    try {
      const encodedSymbol = encodeURIComponent(s);
      const qResponse = await fetch(`/api/quote/${encodedSymbol}`);
      
      if (!qResponse.ok) {
        const errorText = await qResponse.text();
        console.error("Server API Error:", qResponse.status, errorText);
        throw new Error(`خطأ في السيرفر (${qResponse.status}): تعذر جلب بيانات السهم.`);
      }

      const contentType = qResponse.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await qResponse.text();
        console.error("Non-JSON Response Catch:", text.substring(0, 100));
        if (isStaticHost) {
          throw new Error("تنبيه: أنت تستخدم نسخة العرض المستضافة. يرجى فتح التطبيق من داخل AI Studio لرؤية البيانات الحقيقية.");
        }
        throw new Error("تلقى النظام رداً غير صالح من السيرفر.");
      }

      const qData = await qResponse.json();
      
      if (qData.error) {
        throw new Error(qData.error);
      }

      // Handle warnings gracefully (partial data)
      if (qData.warning) {
        console.warn("API Warning:", qData.warning);
      }

      setQuote(qData);

      // Fetch History independently
      try {
        const sixMonthsAgo = Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60);
        const hRes = await fetch(`/api/history/${encodedSymbol}?period1=${sixMonthsAgo}`);
        if (hRes.ok) {
          const hData = await hRes.json();
          if (Array.isArray(hData)) {
            const mapped = hData.filter(d => d && d.date).map((d: any) => ({
              ...d,
              date: safeFormat(d.date, 'MMM dd'),
            }));
            setHistory(mapped);
            // Trigger AI analysis even with partial history
            analyzeWithAI(qData, mapped.slice(-30));
          } else {
            // No history, still try analysis with just quote
            analyzeWithAI(qData, []);
          }
        } else {
          // History fetch failed, still try analysis
          analyzeWithAI(qData, []);
        }
      } catch (err) { 
        console.warn("History fetch failed silenty:", err);
        analyzeWithAI(qData, []); 
      }

      // Fetch News independently
      try {
        const nRes = await fetch(`/api/news/${s}`);
        if (nRes.ok) {
          const nData = await nRes.json();
          setNews(nData);
        }
      } catch (err) { console.warn("Failed to fetch news:", err); }

    } catch (err: any) {
      console.error("Fetch Data Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithAI = async (currentQuote: StockQuote, recentHistory: HistoricalData[]) => {
    if (!ai) {
      console.warn("AI Analysis skipped: Gemini API Key not configured.");
      setAnalysis({
        sentiment: 'neutral',
        patterns: ["خدمة الذكاء الاصطناعي غير مفعلة"],
        reasoning: "يرجى التأكد من إعداد مفتاح API الخاص بـ Gemini في إعدادات المشروع لتفعيل التحليلات الذكية."
      });
      return;
    }
    setAnalyzing(true);
    setAnalysis(null); // Clear previous
    try {
      const historySummary = recentHistory.length > 0 
        ? recentHistory.map(h => `${h.date}: ${h.close}`).join(', ')
        : "بيانات التاريخ غير متوفرة";

      const prompt = `
        بصفتك محلل مالي خبير، قم بتحليل السهم التالي وقدم توصية دقيقة.
        السهم: ${currentQuote.longName || currentQuote.symbol}
        السعر: ${currentQuote.regularMarketPrice} ${currentQuote.currency}
        الأداء الأخير: ${historySummary}

        يجب أن يكون الرد بتنسيق JSON حصراً:
        {
          "sentiment": "positive" | "negative" | "neutral",
          "patterns": ["نموذج فني 1", "نموذج فني 2"],
          "entryPrice": رقم,
          "exitTarget": رقم,
          "reboundPoint": رقم,
          "reasoning": "شرح التحليل الفني باختصار باللغة العربية"
        }
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "أنت محلل تقني محترف وموجز. أجب دائماً بتنسيق JSON صالح فقط."
        }
      });

      let text = result.text || "{}";
      // Sanitize JSON response if needed (handle markdown blocks if any)
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      
      const parsedAnalysis = JSON.parse(text);
      setAnalysis(parsedAnalysis);
    } catch (err) {
      console.error("AI Analysis failed:", err);
      setAnalysis({
        sentiment: 'neutral',
        patterns: ["خطأ في المعالجة"],
        reasoning: "تعذر الحصول على تحليل فني حالياً. يرجى المحاولة مرة أخرى لاحقاً."
      });
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchData(symbol);
  }, []);

  const handleStockChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = COMMON_STOCKS.find(s => s.value === e.target.value);
    if (selected) {
      setSymbol(selected.value);
      setMarket(selected.market as any);
      setTvSymbol(selected.tv);
      fetchData(selected.value);
    }
  };

  const isPositive = quote && (quote.regularMarketChange ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-bg text-text-main font-sans selection:bg-accent-blue/30" dir="rtl">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#16181c,transparent)]" />
      </div>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 py-8 lg:px-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 border-b border-border-custom pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent-blue">PRO-TRADER BURAQ</span>
              <div className="h-[1px] w-8 bg-accent-blue" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white mb-2">
              {quote?.shortName || quote?.longName || "براق للتداول"}
              <span className="text-text-muted text-lg mr-3 font-mono">[{symbol}]</span>
            </h1>
            <p className="text-text-muted max-w-lg leading-relaxed font-light">
              تحليل شامل يعتمد على النماذج الفنية والذكاء الاصطناعي للسوق {market === 'TASI' ? 'السعودي' : 'الأمريكي'}.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={async () => {
                try {
                  const res = await fetch('/api/test');
                  const contentType = res.headers.get("content-type");
                  if (!contentType || !contentType.includes("application/json")) {
                    const text = await res.text();
                    alert(`خطأ: السيرفر لم يرسل بيانات JSON صالحة. الرد كان: ${text.substring(0, 50)}...`);
                    return;
                  }
                  const data = await res.json();
                  alert(`نتيجة الاختبار: ${data.status} - السعر: ${data.price || 'N/A'}`);
                } catch (e: any) {
                  alert(`فشل اختبار الاتصال: ${e.message}`);
                }
              }}
              className="text-[10px] font-mono border border-border-custom hover:border-accent-blue px-3 py-1 rounded-full text-text-muted"
            >
              اختبار الاتصال
            </button>

            {user ? (
              <div className="flex items-center gap-3 ml-4 bg-surface border border-border-custom pl-4 py-1 rounded-full">
                <img 
                  src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${user.email}`} 
                  alt={user.user_metadata?.full_name || ""} 
                  className="w-10 h-10 rounded-full border border-accent-blue/50"
                  referrerPolicy="no-referrer"
                />
                <div className="hidden lg:block">
                  <p className="text-[10px] text-text-muted font-mono">متصل</p>
                  <p className="text-xs font-bold">{user.user_metadata?.full_name || 'مستخدم'}</p>
                </div>
                <button 
                  onClick={() => logout()}
                  className="text-[10px] font-mono text-accent-red hover:underline mr-2 border-r border-border-custom pr-2"
                >
                  خروج
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="text-xs font-mono border border-border-custom hover:border-accent-blue px-4 py-3 transition-colors ml-4 rounded"
              >
                تسجيل الدخول
              </button>
            )}

            <div className="relative group">
              <select 
                onChange={handleStockChange}
                value={symbol}
                className="appearance-none bg-surface border border-border-custom text-white px-6 py-3 rounded focus:outline-none focus:border-accent-blue transition-colors cursor-pointer pr-12 font-mono text-sm min-w-[200px]"
              >
                {COMMON_STOCKS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronRight className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none rotate-90" />
            </div>
            
            <button 
              onClick={() => fetchData(symbol)}
              disabled={loading}
              className="bg-accent-blue hover:bg-accent-blue/80 text-white px-6 py-3 font-bold transition-all disabled:opacity-50 flex items-center gap-2 rounded"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              تحديث
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-accent-red/10 border border-accent-red/50 p-4 mb-8 flex items-center gap-3 rounded">
            <AlertTriangle className="text-accent-red" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          
          {/* Price & Stats Card */}
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-surface border border-border-custom p-8 relative overflow-hidden rounded-xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 blur-3xl -mr-16 -mt-16 rounded-full" />
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-text-muted mb-1">السعر الحالي</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-mono font-medium tracking-tighter text-white">
                      {loading && !quote ? (
                         <Loader2 className="w-8 h-8 animate-spin text-accent-blue" />
                      ) : (
                         quote?.regularMarketPrice?.toLocaleString() || "---"
                      )}
                    </span>
                    <span className="text-text-muted font-mono text-sm">{quote?.currency}</span>
                  </div>
                </div>
                {quote && (
                  <div className={cn(
                    "flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full",
                    isPositive ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
                  )}>
                    {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {quote.regularMarketChangePercent?.toFixed(2)}%
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-border-custom">
                <div>
                  <p className="text-[10px] text-text-muted uppercase mb-1">الأعلى اليوم</p>
                  <p className="font-mono text-lg text-white">{quote?.regularMarketDayHigh?.toLocaleString() || "---"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase mb-1">الأدنى اليوم</p>
                  <p className="font-mono text-lg text-white">{quote?.regularMarketDayLow?.toLocaleString() || "---"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-text-muted uppercase mb-1">حجم التداول</p>
                  <p className="font-mono text-lg text-white">{(quote?.regularMarketVolume || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* AI Recommendation Card */}
            <div className={cn(
              "p-8 border relative group rounded-xl",
              analysis?.sentiment === 'positive' ? "bg-accent-green/5 border-accent-green/20" : 
              analysis?.sentiment === 'negative' ? "bg-accent-red/5 border-accent-red/20" : "bg-surface border-border-custom"
            )}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Activity className={cn(
                    "w-5 h-5",
                    analysis?.sentiment === 'positive' ? "text-accent-green" : 
                    analysis?.sentiment === 'negative' ? "text-accent-red" : "text-accent-blue"
                  )} />
                  <h3 className="text-lg font-bold text-white">توصية الذكاء الاصطناعي</h3>
                </div>
                {analyzing && <Loader2 className="w-4 h-4 animate-spin text-accent-blue" />}
              </div>

              {!analyzing && analysis ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "px-4 py-2 text-sm font-bold uppercase tracking-wider rounded",
                      analysis.sentiment === 'positive' ? "bg-accent-green text-black" : 
                      analysis.sentiment === 'negative' ? "bg-accent-red text-white" : "bg-gray-700 text-white"
                    )}>
                      {analysis.sentiment === 'positive' ? "إيجابي / دخول" : 
                       analysis.sentiment === 'negative' ? "سلبي / تريث" : "محايد"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.patterns.map(p => (
                        <span key={p} className="text-[10px] bg-white/5 border border-white/10 px-2 py-1 text-text-muted rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-text-muted leading-relaxed italic">
                    {analysis.reasoning}
                  </p>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border-custom">
                    {analysis.sentiment === 'positive' ? (
                      <>
                        <div className="bg-bg p-3 border border-border-custom rounded">
                          <p className="text-[10px] text-text-muted uppercase mb-1 flex items-center gap-1">
                            <ArrowRight className="w-2 h-2" /> سعر الدخول المقترح
                          </p>
                          <p className="text-xl font-mono text-accent-green">{analysis.entryPrice}</p>
                        </div>
                        <div className="bg-bg p-3 border border-border-custom rounded">
                          <p className="text-[10px] text-text-muted uppercase mb-1 flex items-center gap-1">
                            <Target className="w-2 h-2" /> الهدف المتوقع
                          </p>
                          <p className="text-xl font-mono text-accent-blue">{analysis.exitTarget}</p>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 bg-bg p-3 border border-border-custom rounded">
                        <p className="text-[10px] text-text-muted uppercase mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-2 h-2 text-accent-red" /> نقطة الارتداد المتوقعة
                        </p>
                        <p className="text-xl font-mono text-accent-red">{analysis.reboundPoint || "بانتظار التأكيد"}</p>
                      </div>
                    )}
                  </div>

                  {/* Dynamic Risk Management Advice */}
                  <div className="mt-4 p-4 bg-accent-blue/5 border border-accent-blue/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-3 h-3 text-accent-blue" />
                      <span className="text-[10px] font-bold text-accent-blue uppercase">خطة إدارة المخاطر الذكية</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-text-muted">وقف الخسارة المقترح:</span>
                          <span className="font-mono text-accent-red font-bold">
                            {analysis.sentiment === 'positive' && analysis.entryPrice 
                              ? (analysis.entryPrice * 0.95).toFixed(2) 
                              : "---"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-text-muted">توزيع المحفظة (الحد الأقصى):</span>
                          <span className="font-mono text-accent-blue font-bold">
                            {market === 'TASI' ? '5% - 8%' : '3% - 5%'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-text-muted">مستوى المخاطرة:</span>
                          <span className={cn(
                            "font-bold",
                            market === 'TASI' ? "text-accent-blue" : "text-gray-400"
                          )}>
                            {market === 'TASI' ? 'متوسطة (سوق ناشئ)' : 'عالية (تقلبات دولية)'}
                          </span>
                        </div>
                    </div>
                    <p className="mt-3 text-[9px] text-text-muted leading-tight">
                      * تعتمد الإدارة على نسبة 5% وقف خسارة تلقائي بناءً على سعر الدخول المقترح.
                    </p>
                  </div>
                </div>
              ) : analyzing ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-12 h-12 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" />
                  <p className="text-xs text-text-muted font-mono animate-pulse">جاري معالجة البيانات الفنية...</p>
                </div>
              ) : (
                <p className="text-sm text-text-muted font-mono text-center py-8">لا تتوفر تحليلات حاليا</p>
              )}
            </div>
          </div>

          {/* Chart Section */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <div className="bg-surface border border-border-custom p-8 flex-1 rounded-xl">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <ChartIcon className="w-5 h-5 text-text-muted" />
                  <h3 className="text-sm font-mono text-text-muted uppercase tracking-widest">أداء السهم الفني</h3>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] bg-accent-blue/10 text-accent-blue px-2 py-1 font-mono uppercase rounded">6 أشهر</span>
                </div>
              </div>
              
              <div className="h-[500px] w-full bg-bg/50 border border-border-custom rounded-lg overflow-hidden grayscale-[0.2] hover:grayscale-0 transition-all">
                <TradingViewWidget tvSymbol={tvSymbol} />
              </div>
            </div>

            {/* News Section */}
            <div className="bg-surface border border-border-custom p-8 rounded-xl">
              <div className="flex items-center gap-2 mb-6">
                <Newspaper className="w-5 h-5 text-text-muted" />
                <h3 className="text-sm font-mono text-text-muted uppercase tracking-widest">أخبار الشركة</h3>
              </div>
              <div className="space-y-6">
                {news.length > 0 ? news.map((item) => (
                  <a 
                    key={item.uuid} 
                    href={item.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block group border-b border-border-custom pb-4 last:border-0 hover:border-accent-blue/50 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <h4 className="text-sm font-medium text-text-main group-hover:text-white transition-colors flex-1 leading-relaxed">
                        {item.title}
                      </h4>
                      <ArrowLeft className="w-4 h-4 text-text-muted group-hover:text-accent-blue transition-all opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-text-muted font-mono uppercase">{item.publisher}</span>
                      <span className="text-[10px] text-border-custom font-mono">•</span>
                      <span className="text-[10px] text-text-muted font-mono">{safeFormat(item.providerPublishTime * 1000, 'yyyy/MM/dd')}</span>
                    </div>
                  </a>
                )) : (
                  <p className="text-text-muted text-xs italic">لا توجد أخبار متاحة حالياً.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <footer className="mt-12 pt-8 border-t border-border-custom flex flex-col md:flex-row justify-between items-center gap-4 text-text-muted">
          <p className="text-[10px] font-mono uppercase tracking-widest text-center md:text-right">
            تنبيه: هذا التحليل استرشادي فقط ولا يعتبر نصيحة استثمارية. تداول بمسؤولية.
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              <span className="text-[10px] font-mono">نظام براق نشط</span>
            </div>
            <span className="text-[10px] font-mono">© 2026 Buraq Analytics</span>
          </div>
        </footer>

        {/* Auth Modal */}
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" dir="rtl">
            <div className="bg-surface border border-border-custom w-full max-w-md rounded-2xl p-8 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 blur-3xl -mr-16 -mt-16 rounded-full" />
              
              <button 
                onClick={() => setIsAuthModalOpen(false)}
                className="absolute top-4 left-4 text-text-muted hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-accent-blue/10 rounded-xl flex items-center justify-center mx-auto mb-4 border border-accent-blue/20">
                  <Lock className="w-6 h-6 text-accent-blue" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {authMode === 'login' ? 'مرحباً بعودتك' : 'إنشاء حساب جديد'}
                </h2>
                <p className="text-text-muted text-xs">
                  {authMode === 'login' ? 'ادخل بياناتك للوصول إلى منصة براق' : 'انضم إلينا للحصول على تحليلات متقدمة'}
                </p>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-[10px] text-text-muted uppercase mb-1 mr-1">الاسم الكامل</label>
                    <div className="relative">
                      <UserIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input 
                        type="text"
                        required
                        value={authFullName}
                        onChange={(e) => setAuthFullName(e.target.value)}
                        className="w-full bg-bg border border-border-custom text-white pr-10 pl-4 py-3 rounded-xl focus:outline-none focus:border-accent-blue transition-all"
                        placeholder="أحمد محمد"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] text-text-muted uppercase mb-1 mr-1">اسم المستخدم أو البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input 
                      type="text"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full bg-bg border border-border-custom text-white pr-10 pl-4 py-3 rounded-xl focus:outline-none focus:border-accent-blue transition-all"
                      placeholder="admin أو name@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-text-muted uppercase mb-1 mr-1">كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input 
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full bg-bg border border-border-custom text-white pr-10 pl-4 py-3 rounded-xl focus:outline-none focus:border-accent-blue transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded text-accent-red text-[10px] text-center">
                    {authError}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-accent-blue hover:bg-accent-blue/80 text-white py-4 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {authMode === 'login' ? 'دخول' : 'تسجيل'}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-border-custom text-center">
                <p className="text-text-muted text-xs">
                  {authMode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="mr-2 text-accent-blue hover:underline font-bold"
                  >
                    {authMode === 'login' ? 'إنشاء حساب' : 'سجل دخولك'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
