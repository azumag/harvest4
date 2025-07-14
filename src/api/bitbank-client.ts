import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import {
  BitbankConfig,
  BitbankTicker,
  BitbankOrder,
  BitbankOrderRequest,
  BitbankBalance,
  BitbankApiResponse,
} from '../types/bitbank';

export class BitbankClient {
  private client: AxiosInstance;
  private config: BitbankConfig;

  constructor(config: BitbankConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
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

  async getTicker(pair: string): Promise<BitbankTicker> {
    const response = await this.client.get<BitbankApiResponse<BitbankTicker>>(
      `/v1/ticker/${pair}`
    );
    
    if (response.data.success !== 1) {
      throw new Error('Failed to get ticker data');
    }
    
    return response.data.data;
  }

  async getBalance(): Promise<BitbankBalance[]> {
    const path = '/v1/user/assets';
    const headers = this.createAuthHeaders(path);
    
    const response = await this.client.get<BitbankApiResponse<{ assets: BitbankBalance[] }>>(
      path,
      { headers }
    );
    
    if (response.data.success !== 1) {
      throw new Error('Failed to get balance data');
    }
    
    return response.data.data.assets;
  }

  async createOrder(orderRequest: BitbankOrderRequest): Promise<BitbankOrder> {
    const path = '/v1/user/spot/order';
    const body = JSON.stringify(orderRequest);
    const headers = this.createAuthHeaders(path, body);
    
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
    const headers = this.createAuthHeaders(path);
    
    const response = await this.client.get<BitbankApiResponse<BitbankOrder>>(
      path,
      { headers }
    );
    
    if (response.data.success !== 1) {
      throw new Error('Failed to get order data');
    }
    
    return response.data.data;
  }

  async cancelOrder(pair: string, orderId: number): Promise<BitbankOrder> {
    const path = '/v1/user/spot/cancel_order';
    const body = JSON.stringify({ pair, order_id: orderId });
    const headers = this.createAuthHeaders(path, body);
    
    const response = await this.client.post<BitbankApiResponse<BitbankOrder>>(
      path,
      { pair, order_id: orderId },
      { headers }
    );
    
    if (response.data.success !== 1) {
      throw new Error('Failed to cancel order');
    }
    
    return response.data.data;
  }

  async getActiveOrders(pair: string): Promise<BitbankOrder[]> {
    const path = `/v1/user/spot/active_orders?pair=${pair}`;
    const headers = this.createAuthHeaders(path);
    
    const response = await this.client.get<BitbankApiResponse<{ orders: BitbankOrder[] }>>(
      path,
      { headers }
    );
    
    if (response.data.success !== 1) {
      throw new Error('Failed to get active orders');
    }
    
    return response.data.data.orders;
  }
}