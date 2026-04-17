export interface StockQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  longName?: string;
  shortName?: string;
  currency?: string;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
}

export interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume: number;
}

export interface NewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  type: string;
}

export interface AIAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  patterns: string[];
  entryPrice?: number;
  exitTarget?: number;
  reboundPoint?: number;
  reasoning: string;
}
