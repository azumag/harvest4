export interface BitbankConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

export interface BitbankTicker {
  pair: string;
  sell: string;
  buy: string;
  high: string;
  low: string;
  last: string;
  vol: string;
  timestamp: number;
}

export interface BitbankOrder {
  order_id: number;
  pair: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  start_amount: string;
  remaining_amount: string;
  executed_amount: string;
  price?: string;
  average_price: string;
  ordered_at: number;
  status: 'UNFILLED' | 'PARTIALLY_FILLED' | 'FULLY_FILLED' | 'CANCELED_UNFILLED' | 'CANCELED_PARTIALLY_FILLED';
}

export interface BitbankOrderRequest {
  pair: string;
  amount: string;
  price?: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
}

export interface BitbankBalance {
  asset: string;
  free_amount: string;
  locked_amount: string;
  onhand_amount: string;
  withdrawal_fee: string;
}

export interface BitbankApiResponse<T> {
  success: number;
  data: T;
}

export interface TradingSignal {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  price: number;
  amount: number;
  reason: string;
}

export interface TradingPosition {
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number;
  orderId?: number;
}

export interface ProfitCalculation {
  totalProfit: number;
  totalReturn: number;
  winRate: number;
  totalTrades: number;
  currentDrawdown: number;
  maxDrawdown: number;
}

// WebSocket Real-time Data Types
export interface OrderBookEntry {
  price: string;
  amount: string;
}

export interface OrderBookData {
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
  asks_over: string;
  bids_under: string;
  asks_count: number;
  bids_count: number;
  sequence_id: number;
  timestamp: number;
}

export interface DepthDiffData {
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
  sequence_id: number;
  timestamp: number;
}

export interface TransactionData {
  transaction_id: number;
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  executed_at: number;
}

export interface TickerStreamData {
  pair: string;
  sell: string;
  buy: string;
  high: string;
  low: string;
  last: string;
  vol: string;
  timestamp: number;
}

export interface WebSocketChannels {
  ticker: string;
  transactions: string;
  depth_diff: string;
  depth_whole: string;
}

// Market Analysis Types
export interface OrderBookAnalysis {
  bidAskSpread: number;
  bidAskSpreadPercent: number;
  midPrice: number;
  totalBidVolume: number;
  totalAskVolume: number;
  orderBookImbalance: number;
  supportLevel: number;
  resistanceLevel: number;
  liquidityDepth: number;
  largeOrderThreshold: number;
  largeOrders: {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
  };
}

export interface VolumeAnalysis {
  currentVolume: number;
  volumeMA: number;
  volumeSpike: boolean;
  volumeProfile: {
    price: number;
    volume: number;
  }[];
  twap: number;
  vwap: number;
  institutionalActivity: number;
}

export interface MarketMicrostructure {
  averageSpread: number;
  spreadTrend: 'increasing' | 'decreasing' | 'stable';
  tradeFrequency: number;
  priceImpact: number;
  liquidityProviders: {
    [price: string]: {
      count: number;
      volume: number;
    };
  };
  executionQuality: number;
}

export interface MarketAlert {
  type: 'anomaly' | 'breakout' | 'volume' | 'spread' | 'system';
  level: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  data: unknown;
}

export interface RealtimeMarketData {
  pair: string;
  orderBook: OrderBookData;
  recentTransactions: TransactionData[];
  ticker: TickerStreamData;
  analysis: {
    orderBook: OrderBookAnalysis;
    volume: VolumeAnalysis;
    microstructure: MarketMicrostructure;
  };
  alerts: MarketAlert[];
  lastUpdated: number;
}