import { jest } from '@jest/globals';
import axios, { AxiosResponse } from 'axios';
import { BitbankClient } from '../api/bitbank-client';
import { BitbankConfig, BitbankApiResponse, BitbankTicker } from '../types/bitbank';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BitbankClient', () => {
  let client: BitbankClient;
  let config: BitbankConfig;

  beforeEach(() => {
    config = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      baseUrl: 'https://api.bitbank.cc',
    };

    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: { timeout: 10000 },
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    client = new BitbankClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTicker', () => {
    it('should return ticker data for a given pair', async () => {
      const mockTicker: BitbankTicker = {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '100.5',
        timestamp: 1640995200000,
      };

      const mockResponse: AxiosResponse<BitbankApiResponse<BitbankTicker>> = {
        data: {
          success: 1,
          data: mockTicker,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.MockedFunction<any>).mockResolvedValue(mockResponse);

      const result = await client.getTicker('btc_jpy');

      expect(result).toEqual(mockTicker);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/ticker/btc_jpy');
    });

    it('should throw error when API returns failure', async () => {
      const mockResponse: AxiosResponse<BitbankApiResponse<BitbankTicker>> = {
        data: {
          success: 0,
          data: {} as BitbankTicker,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.MockedFunction<any>).mockResolvedValue(mockResponse);

      await expect(client.getTicker('btc_jpy')).rejects.toThrow('Failed to get ticker data');
    });
  });

  describe('createOrder', () => {
    it('should create a buy order successfully', async () => {
      const orderRequest = {
        pair: 'btc_jpy',
        amount: '0.001',
        price: '5000000',
        side: 'buy' as const,
        type: 'limit' as const,
      };

      const mockOrder = {
        order_id: 12345,
        pair: 'btc_jpy',
        side: 'buy' as const,
        type: 'limit' as const,
        start_amount: '0.001',
        remaining_amount: '0.001',
        executed_amount: '0.000',
        price: '5000000',
        average_price: '0',
        ordered_at: 1640995200000,
        status: 'UNFILLED' as const,
      };

      const mockResponse: AxiosResponse<BitbankApiResponse<typeof mockOrder>> = {
        data: {
          success: 1,
          data: mockOrder,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.post as jest.MockedFunction<any>).mockResolvedValue(mockResponse);

      const result = await client.createOrder(orderRequest);

      expect(result).toEqual(mockOrder);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/v1/user/spot/order',
        orderRequest,
        expect.objectContaining({
          headers: expect.objectContaining({
            'ACCESS-KEY': config.apiKey,
            'ACCESS-NONCE': expect.any(String),
            'ACCESS-SIGNATURE': expect.any(String),
          }),
        })
      );
    });

    it('should throw error when order creation fails', async () => {
      const orderRequest = {
        pair: 'btc_jpy',
        amount: '0.001',
        price: '5000000',
        side: 'buy' as const,
        type: 'limit' as const,
      };

      const mockResponse: AxiosResponse<BitbankApiResponse<any>> = {
        data: {
          success: 0,
          data: {},
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.post as jest.MockedFunction<any>).mockResolvedValue(mockResponse);

      await expect(client.createOrder(orderRequest)).rejects.toThrow('Failed to create order');
    });
  });

  describe('authentication', () => {
    it('should create proper authentication headers', () => {
      const path = '/v1/user/assets';
      const body = '{"test": "data"}';

      // Access the private method through casting
      const authHeaders = (client as any).createAuthHeaders(path, body);

      expect(authHeaders).toHaveProperty('ACCESS-KEY', config.apiKey);
      expect(authHeaders).toHaveProperty('ACCESS-NONCE');
      expect(authHeaders).toHaveProperty('ACCESS-SIGNATURE');
      expect(authHeaders['ACCESS-NONCE']).toMatch(/^\d+$/);
      expect(authHeaders['ACCESS-SIGNATURE']).toHaveLength(64);
    });
  });
});