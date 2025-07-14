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