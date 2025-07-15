import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import {
  BitbankConfig,
  BitbankTicker,
  BitbankOrder,
  BitbankOrderRequest,
  BitbankBalance,
  BitbankApiResponse,
} from '../types/bitbank';

interface RequestCache {
  [key: string]: {
    data: any;
    timestamp: number;
    ttl: number;
  };
}

interface BatchRequest {
  method: string;
  path: string;
  body?: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

export class OptimizedBitbankClient {
  private client: AxiosInstance;
  private config: BitbankConfig;
  private requestCache: RequestCache = {};
  private batchQueue: BatchRequest[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // 50ms batch delay
  private readonly DEFAULT_CACHE_TTL = 5000; // 5 seconds cache TTL
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly RATE_LIMIT_DELAY = 100; // 100ms between requests

  constructor(config: BitbankConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
      // Connection pooling configuration
      httpAgent: new HttpAgent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 10,
        maxFreeSockets: 5,
      }),
      httpsAgent: new HttpsAgent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 10,
        maxFreeSockets: 5,
      }),
    });

    // Add response interceptor for automatic caching
    this.client.interceptors.response.use(
      (response) => {
        // Cache GET requests automatically
        if (response.config.method === 'get') {
          const cacheKey = this.getCacheKey(response.config.url || '', response.config.params);
          this.setCache(cacheKey, response.data, this.DEFAULT_CACHE_TTL);
        }
        return response;
      },
      (error) => Promise.reject(error)
    );
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

  private getCacheKey(url: string, params?: any): string {
    return `${url}${params ? JSON.stringify(params) : ''}`;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.requestCache[key] = {
      data,
      timestamp: Date.now(),
      ttl,
    };
  }

  private getCache(key: string): any | null {
    const cached = this.requestCache[key];
    if (!cached) return null;

    if (Date.now() - cached.timestamp > cached.ttl) {
      delete this.requestCache[key];
      return null;
    }

    return cached.data;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  private processBatch(): void {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    // Group by method and path for batch processing
    const groups = new Map<string, BatchRequest[]>();
    batch.forEach(request => {
      const key = `${request.method}:${request.path}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(request);
    });

    // Process each group
    groups.forEach(async (requests) => {
      try {
        await this.enforceRateLimit();
        
        // For now, process requests individually but could be optimized for true batching
        // if the API supports it
        for (const request of requests) {
          try {
            let result;
            if (request.method === 'GET') {
              const cacheKey = this.getCacheKey(request.path);
              const cached = this.getCache(cacheKey);
              if (cached) {
                request.resolve(cached);
                continue;
              }
              result = await this.client.get(request.path);
            } else if (request.method === 'POST') {
              const headers = this.createAuthHeaders(request.path, JSON.stringify(request.body));
              result = await this.client.post(request.path, request.body, { headers });
            }
            request.resolve(result?.data);
          } catch (error) {
            request.reject(error);
          }
        }
      } catch (error) {
        requests.forEach(request => request.reject(error));
      }
    });
  }

  private queueRequest(method: string, path: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        method,
        path,
        body,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Set up batch processing timer
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }
      
      this.batchTimer = setTimeout(() => {
        this.processBatch();
        this.batchTimer = null;
      }, this.BATCH_DELAY);
    });
  }

  async getTicker(pair: string): Promise<BitbankTicker> {
    const path = `/v1/ticker/${pair}`;
    const cacheKey = this.getCacheKey(path);
    
    // Check cache first
    const cached = this.getCache(cacheKey);
    if (cached && cached.success === 1) {
      return cached.data;
    }

    const response = await this.queueRequest('GET', path);
    
    if (response.success !== 1) {
      throw new Error('Failed to get ticker data');
    }
    
    return response.data;
  }

  async getBalance(): Promise<BitbankBalance[]> {
    const path = '/v1/user/assets';
    const response = await this.queueRequest('POST', path, {});
    
    if (response.success !== 1) {
      throw new Error('Failed to get balance data');
    }
    
    return response.data.assets;
  }

  async createOrder(orderRequest: BitbankOrderRequest): Promise<BitbankOrder> {
    const path = '/v1/user/spot/order';
    await this.enforceRateLimit(); // Critical operations bypass batching
    
    const headers = this.createAuthHeaders(path, JSON.stringify(orderRequest));
    const response = await this.client.post<BitbankApiResponse<BitbankOrder>>(
      path,
      orderRequest,
      { headers }
    );
    
    if (response.data.success !== 1) {
      throw new Error('Failed to create order');
    }
    
    return response.data.data;
  }

  async getOrder(pair: string, orderId: number): Promise<BitbankOrder> {
    const path = `/v1/user/spot/order?pair=${pair}&order_id=${orderId}`;
    const response = await this.queueRequest('POST', path, {});
    
    if (response.success !== 1) {
      throw new Error('Failed to get order data');
    }
    
    return response.data;
  }

  async cancelOrder(pair: string, orderId: number): Promise<BitbankOrder> {
    const path = '/v1/user/spot/cancel_order';
    await this.enforceRateLimit(); // Critical operations bypass batching
    
    const body = { pair, order_id: orderId };
    const headers = this.createAuthHeaders(path, JSON.stringify(body));
    const response = await this.client.post<BitbankApiResponse<BitbankOrder>>(
      path,
      body,
      { headers }
    );
    
    if (response.data.success !== 1) {
      throw new Error('Failed to cancel order');
    }
    
    return response.data.data;
  }

  async getActiveOrders(pair: string): Promise<BitbankOrder[]> {
    const path = `/v1/user/spot/active_orders?pair=${pair}`;
    const response = await this.queueRequest('POST', path, {});
    
    if (response.success !== 1) {
      throw new Error('Failed to get active orders');
    }
    
    return response.data.orders;
  }

  // Batch multiple requests for efficiency
  async batchRequests<T>(requests: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(requests.map(request => request()));
  }

  // Clear cache manually if needed
  clearCache(): void {
    this.requestCache = {};
  }

  // Get performance metrics
  getMetrics(): {
    requestCount: number;
    cacheSize: number;
    lastRequestTime: number;
  } {
    return {
      requestCount: this.requestCount,
      cacheSize: Object.keys(this.requestCache).length,
      lastRequestTime: this.lastRequestTime,
    };
  }
}