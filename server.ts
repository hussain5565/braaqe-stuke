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

logToFile("--- NEW STARTUP ---");
logToFile(`DEBUG: yf check: ${yf && typeof yf.quote === 'function' ? 'OK' : 'FAIL'}`);
if (yf && !yf.quote) {
  logToFile(`DEBUG: yf keys: ${Object.keys(yf).join(', ')}`);
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

  app.use(express.json());

  logToFile("Registering routes...");
  // Health check route
  app.get("/api/health", (req, res) => {
    logToFile("HEALTH CHECK CALLED");
    res.set("Content-Type", "application/json");
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Logging Middleware
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      logToFile(`INCOMING REQUEST: ${req.method} ${req.url}`);
    }
    next();
  });

  // API Route: Fetch Stock Quote
  app.get("/api/quote/:symbol", async (req, res) => {
    const { symbol } = req.params;
    console.log(`[SERVER] API Request: /api/quote/${symbol}`);
    // Explicitly set JSON content type first
    res.setHeader("Content-Type", "application/json");

    logToFile(`>>> API CALL: quote for ${symbol}`);

    try {
      if (symbol === 'TEST') {
        const dummy = {
          symbol: 'TEST',
          regularMarketPrice: 123.45,
          regularMarketChange: 1.25,
          regularMarketChangePercent: 1.02,
          currency: 'USD',
          longName: 'Test Connectivity Stock'
        };
        return res.json(dummy);
      }

      // Try-catch specifically for the YF library call to prevent route crash
      let quote: any = null;
      try {
        logToFile(`STAGING: Fetching quote for ${symbol}`);
        quote = await yf.quote(symbol);

        // Fallback for Saudi stocks if they return undefined or missing data
        if (!quote || !quote.regularMarketPrice) {
          logToFile(`DEBUG: Quote missing data for ${symbol}, trying search...`);
          const search = await yf.search(symbol);
          const found = search.quotes?.find((q: any) => q.symbol === symbol);
          if (found) {
            quote = {
              symbol: symbol,
              regularMarketPrice: found.prevClose || found.price || 0,
              shortName: found.shortname,
              longName: found.longname,
              currency: found.currency || 'SAR',
              regularMarketChangePercent: 0,
              regularMarketChange: 0
            };
          }
        }
      } catch (yfErr: any) {
        logToFile(`YAHOO LIB ERROR (quote) for ${symbol}: ${yfErr.message}`);
        return res.status(200).json({
          warning: `بيانات السهم غير متوفرة حالياً لـ ${symbol}`,
          symbol: symbol,
          regularMarketPrice: 0,
          currency: '---'
        });
      }

      if (!quote) {
        logToFile(`DEBUG: Quote not found for ${symbol}`);
        return res.status(200).json({
          warning: "السهم غير موجود",
          symbol: symbol,
          regularMarketPrice: 0,
          currency: '---'
        });
      }

      logToFile(`DEBUG: Quote found for ${symbol}: ${quote.regularMarketPrice}`);
      return res.json(quote);
    } catch (error: any) {
      logToFile(`CRITICAL ROUTE ERROR (quote) for ${req.params.symbol}: ${error.message}`);
      return res.status(500).json({ error: "خطأ داخلي في معالجة طلب السهم" });
    }
  });

  // API Route: Fetch Historical Data
  app.get("/api/history/:symbol", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    try {
      const { symbol } = req.params;
      const { period1 } = req.query;
      logToFile(`DEBUG: Fetching history (via chart) for: ${symbol}`);

      const p1 = period1 ? new Date(Number(period1) * 1000) : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

      // yf.chart is more robust for historical data in non-US markets
      const chartResult = await yf.chart(symbol, {
        period1: p1,
        interval: "1d",
      });

      const formatted = (chartResult.quotes || []).map(q => ({
        date: q.date,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume
      }));

      logToFile(`DEBUG: History (chart) retrieved for ${symbol}, count: ${formatted.length}`);
      return res.json(formatted);
    } catch (error: any) {
      logToFile(`YAHOO ERROR (history/chart) for ${req.params.symbol}: ${error.message}`);
      // Fallback to historical() if chart fails
      try {
        const hist = await yf.historical(req.params.symbol, {
          period1: req.query.period1 ? new Date(Number(req.query.period1) * 1000) : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          interval: "1d"
        });
        return res.json(hist);
      } catch (e2) {
        return res.json([]);
      }
    }
  });

  // API Route: Fetch Company News
  app.get("/api/news/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const result: any = await yf.search(symbol, { newsCount: 5 });
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
