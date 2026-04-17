import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import yf from "yahoo-finance2";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFile = path.join(process.cwd(), "server.log");
function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
}

// In some environments, especially with tsx/esm, we might need to handle the import differently
// However, the "Call new YahooFinance() first" error implies we are calling a method on the class
// rather than an instance. v3 should provide a default instance.
// Let's try to detect and fix.
const yahooFinance = (yf as any).default || yf;
logToFile(`DEBUG: yf type: ${typeof yahooFinance}, is function: ${typeof yahooFinance === 'function'}`);
const yfInstance = (typeof yahooFinance === 'function') ? new (yahooFinance as any)() : yahooFinance;

logToFile("--- NEW STARTUP ---");
logToFile(`DEBUG: yf check: ${yfInstance && typeof yfInstance.quote === 'function' ? 'OK' : 'FAIL'}`);
if (yfInstance && !yfInstance.quote) {
  logToFile(`DEBUG: yf keys: ${Object.keys(yfInstance).join(', ')}`);
}

logToFile("SERVER STARTING...");

process.on("uncaughtException", (err) => {
  logToFile(`CRITICAL ERROR UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
});

process.on("unhandledRejection", (reason: any) => {
  logToFile(`CRITICAL ERROR UNHANDLED REJECTION: ${reason?.message || reason}`);
});

async function startServer() {
  logToFile("startServer() CALLED");
  const app = express();
  const PORT = 3000;

  // Global logging middleware
  app.use((req, res, next) => {
    logToFile(`REQUEST: ${req.method} ${req.url}`);
    next();
  });

  // Global API headers
  app.use("/api", (req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    logToFile(`API REQUEST: ${req.method} ${req.url}`);
    next();
  });

  // API Route: Test quote
  app.get("/api/test", async (req, res) => {
    try {
      const resp = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL`);
      const data: any = await resp.json();
      res.json({ status: 'connected', price: data?.quoteResponse?.result?.[0]?.regularMarketPrice });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // API Route: Fetch Stock Quote
  app.get("/api/quote/:symbol", async (req, res) => {
    const { symbol } = req.params;
    logToFile(`>>> QUOTE FETCH: ${symbol}`);
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
      const data: any = await response.json();
      const quote = data?.quoteResponse?.result?.[0];

      if (!quote) {
        return res.json({
          warning: "بيانات غير متوفرة",
          symbol,
          regularMarketPrice: 0
        });
      }
      return res.json(quote);
    } catch (error: any) {
      return res.json({ warning: "خطأ اتصال", symbol, regularMarketPrice: 0 });
    }
  });

  // API Route: Fetch Historical Data
  app.get("/api/history/:symbol", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    try {
      const { symbol } = req.params;
      logToFile(`DEBUG: Fetching raw history for: ${symbol}`);

      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`);
      const data: any = await response.json();
      const result = data?.chart?.result?.[0];

      if (!result) return res.json([]);

      const timestamps = result.timestamp || [];
      const quotes = result.indicators.quote[0];
      const formatted = timestamps.map((ts: number, i: number) => ({
        date: ts * 1000,
        open: quotes.open[i],
        high: quotes.high[i],
        low: quotes.low[i],
        close: quotes.close[i],
        volume: quotes.volume[i]
      }));

      logToFile(`DEBUG: Raw History retrieved for ${symbol}, count: ${formatted.length}`);
      return res.json(formatted);
    } catch (error: any) {
      logToFile(`RAW HISTORY ERROR for ${req.params.symbol}: ${error.message}`);
      return res.json([]);
    }
  });

  // API Route: Fetch Company News
  app.get("/api/news/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const result: any = await yfInstance.search(symbol, { newsCount: 5 });
      res.json(result.news || []);
    } catch (error: any) {
      logToFile("Error fetching news: " + error.message);
      res.status(500).json({ error: "تعذر جلب الأخبار" });
    }
  });

  // Catch-all for undefined /api routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "الرابط المطلوب غير موجود في النظام" });
  });

  logToFile("Registering middleware...");
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    logToFile("VITE DEV MODE STARTING...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    logToFile("VITE MIDDLEWARE LOADED");
  } else {
    logToFile("PRODUCTION MODE STARTING...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    logToFile("STATIC ROUTES LOADED");
  }

  logToFile(`STARTING LISTEN ON PORT ${PORT}...`);
  app.listen(PORT, "0.0.0.0", () => {
    logToFile(`SUCCESS: Server running on http://localhost:${PORT}`);
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
