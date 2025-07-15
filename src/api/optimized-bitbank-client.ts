import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { Agent } from 'https';
import { Agent as HttpAgent } from 'http';
import {
  BitbankConfig,
  BitbankTicker,
  BitbankOrder,
  BitbankOrderRequest,
  BitbankBalance,
} from '../types/bitbank';

interface BatchRequest {
  path: string;
  method: 'GET' | 'POST';
  body?: any;
  resolve: (data: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

interface CachedResponse {
  data: any;
  timestamp: number;
  ttl: number;
}

export class OptimizedBitbankClient {
  private client: AxiosInstance;
  private config: BitbankConfig;
  private requestQueue: BatchRequest[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // 50ms batching delay
  private readonly RATE_LIMIT_DELAY = 100; // 100ms minimum between requests
  private lastRequestTime = 0;
  private responseCache = new Map<string, CachedResponse>();
  private readonly DEFAULT_CACHE_TTL = 1000; // 1 second cache TTL

  constructor(config: BitbankConfig) {
    this.config = config;
    
    // Create HTTP/HTTPS agents for connection pooling
    const httpsAgent = new Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 60000,
    });

    const httpAgent = new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 60000,
    });

    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 10000,
      httpsAgent,
      httpAgent,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
    });

    // Start cache cleanup timer
    this.startCacheCleanup();
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.responseCache.entries()) {
        if (now - cached.timestamp > cached.ttl) {
          this.responseCache.delete(key);
        }
      }
    }, 5000); // Cleanup every 5 seconds
  }

  private createSignature(message: string): string {
    return createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('hex');
  }

  private createAuthHeaders(path: string, body?: string): Record<string, string> {
    const nonce = Date.now().toString();
    const message = nonce + path + (body || '');
    const signature = this.createSignature(message);

    return {
      'ACCESS-KEY': this.config.apiKey,
      'ACCESS-NONCE': nonce,
      'ACCESS-SIGNATURE': signature,
    };
  }

  private getCacheKey(path: string, body?: string): string {
    return `${path}${body ? `_${JSON.stringify(body)}` : ''}`;
  }

  private getCachedResponse(key: string): any | null {
    const cached = this.responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  }

  private setCachedResponse(key: string, data: any, ttl: number = this.DEFAULT_CACHE_TTL): void {
    this.responseCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  private async executeRequest(
    path: string,
    method: 'GET' | 'POST',
    body?: any,
    useCache: boolean = true,
    cacheTtl: number = this.DEFAULT_CACHE_TTL
  ): Promise<any> {
    // Check cache first for GET requests
    if (method === 'GET' && useCache) {
      const cacheKey = this.getCacheKey(path, body);
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }
    }

    return new Promise((resolve, reject) => {
      const request: BatchRequest = {
        path,
        method,
        body,
        resolve: (data) => {
          if (method === 'GET' && useCache) {
            const cacheKey = this.getCacheKey(path, body);
            this.setCachedResponse(cacheKey, data, cacheTtl);
          }
          resolve(data);
        },
        reject,
        timestamp: Date.now(),
      };

      this.requestQueue.push(request);
      this.scheduleBatchExecution();
    });
  }

  private scheduleBatchExecution(): void {
    if (this.batchTimer) {
      return;
    }

    this.batchTimer = setTimeout(() => {
      this.executeBatch();
    }, this.BATCH_DELAY);
  }

  private async executeBatch(): Promise<void> {
    if (this.requestQueue.length === 0) {
      this.batchTimer = null;
      return;
    }

    const batch = this.requestQueue.splice(0, this.requestQueue.length);
    this.batchTimer = null;

    // Execute requests with rate limiting
    for (const request of batch) {
      await this.executeRequestWithRateLimit(request);
    }
  }

  private async executeRequestWithRateLimit(request: BatchRequest): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      await this.sleep(this.RATE_LIMIT_DELAY - timeSinceLastRequest);
    }

    try {
      let response;
      const headers = this.createAuthHeaders(request.path, request.body);

      if (request.method === 'GET') {
        response = await this.client.get(request.path, { headers });
      } else {
        response = await this.client.post(request.path, request.body, { headers });
      }

      this.lastRequestTime = Date.now();

      if (response.data.success !== 1) {
        throw new Error(`API request failed: ${response.data.error?.message || 'Unknown error'}`);
      }

      request.resolve(response.data.data);
    } catch (error) {
      request.reject(error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTicker(pair: string): Promise<BitbankTicker> {
    return this.executeRequest(`/v1/ticker/${pair}`, 'GET', undefined, true, 500); // 500ms cache for ticker
  }

  async getBalance(): Promise<BitbankBalance[]> {
    const result = await this.executeRequest('/v1/user/assets', 'GET', undefined, true, 2000); // 2s cache for balance
    return result.assets;
  }

  async createOrder(orderRequest: BitbankOrderRequest): Promise<BitbankOrder> {
    return this.executeRequest('/v1/user/spot/order', 'POST', orderRequest, false); // No cache for orders
  }

  async getOrder(pair: string, orderId: number): Promise<BitbankOrder> {
    return this.executeRequest(`/v1/user/spot/order?pair=${pair}&order_id=${orderId}`, 'GET', undefined, true, 1000);
  }

  async cancelOrder(pair: string, orderId: number): Promise<BitbankOrder> {
    return this.executeRequest('/v1/user/spot/cancel_order', 'POST', { pair, order_id: orderId }, false);
  }

  async getActiveOrders(pair: string): Promise<BitbankOrder[]> {
    const result = await this.executeRequest(`/v1/user/spot/active_orders?pair=${pair}`, 'GET', undefined, true, 1000);
    return result.orders;
  }

  // Performance monitoring methods
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.responseCache.size,
      hitRate: 0, // TODO: Implement hit rate tracking
    };
  }

  getQueueSize(): number {
    return this.requestQueue.length;
  }

  clearCache(): void {
    this.responseCache.clear();
  }

  // Batch request for multiple tickers
  async getBatchTickers(pairs: string[]): Promise<Map<string, BitbankTicker>> {
    const promises = pairs.map(pair => 
      this.getTicker(pair).then(ticker => ({ pair, ticker }))
    );
    
    const results = await Promise.all(promises);
    const tickerMap = new Map<string, BitbankTicker>();
    
    for (const { pair, ticker } of results) {
      tickerMap.set(pair, ticker);
    }
    
    return tickerMap;
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Execute any remaining requests
    await this.executeBatch();
    
    // Clear cache
    this.clearCache();
  }
}