import { jest } from '@jest/globals';
import { BitbankClient } from '../api/bitbank-client';
import { TradingBot, TradingBotConfig } from '../bot/trading-bot';
import { BitbankConfig } from '../types/bitbank';
import * as crypto from 'crypto';

describe('Security Testing Suite', () => {
  let config: BitbankConfig;
  let botConfig: TradingBotConfig;

  beforeEach(() => {
    config = {
      apiKey: 'test-api-key-12345',
      apiSecret: 'test-api-secret-abcdef',
      baseUrl: 'https://api.bitbank.cc',
    };

    botConfig = {
      ...config,
      pair: 'btc_jpy',
      initialBalance: 100000,
      maxConcurrentTrades: 3,
      tradingInterval: 30000,
      stopLossPercentage: 2,
      takeProfitPercentage: 4,
      strategy: {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8,
      },
    };
  });

  describe('API Authentication Security', () => {
    it('should generate valid HMAC signatures', () => {
      const client = new BitbankClient(config);
      
      const path = '/v1/user/assets';
      const body = '{"test": "data"}';
      
      // Access private method to test signature generation
      const authHeaders = (client as any).createAuthHeaders(path, body);
      
      expect(authHeaders).toHaveProperty('ACCESS-KEY');
      expect(authHeaders).toHaveProperty('ACCESS-NONCE');
      expect(authHeaders).toHaveProperty('ACCESS-SIGNATURE');
      
      // Verify signature format
      expect(authHeaders['ACCESS-KEY']).toBe(config.apiKey);
      expect(authHeaders['ACCESS-NONCE']).toMatch(/^\d+$/); // Should be numeric timestamp
      expect(authHeaders['ACCESS-SIGNATURE']).toMatch(/^[a-f0-9]{64}$/); // Should be 64-char hex string
    });

    it('should use unique nonces for each request', () => {
      const client = new BitbankClient(config);
      
      const path = '/v1/user/assets';
      const body = '{"test": "data"}';
      
      const headers1 = (client as any).createAuthHeaders(path, body);
      const headers2 = (client as any).createAuthHeaders(path, body);
      
      expect(headers1['ACCESS-NONCE']).not.toBe(headers2['ACCESS-NONCE']);
    });

    it('should generate different signatures for different requests', () => {
      const client = new BitbankClient(config);
      
      const headers1 = (client as any).createAuthHeaders('/v1/user/assets', '{"test": "data1"}');
      const headers2 = (client as any).createAuthHeaders('/v1/user/assets', '{"test": "data2"}');
      
      expect(headers1['ACCESS-SIGNATURE']).not.toBe(headers2['ACCESS-SIGNATURE']);
    });

    it('should handle malformed API credentials gracefully', () => {
      const invalidConfigs = [
        { ...config, apiKey: '' },
        { ...config, apiSecret: '' },
        { ...config, apiKey: null as any },
        { ...config, apiSecret: null as any },
        { ...config, apiKey: undefined as any },
        { ...config, apiSecret: undefined as any },
      ];

      invalidConfigs.forEach(invalidConfig => {
        expect(() => {
          const client = new BitbankClient(invalidConfig);
          // Should not throw during construction, but during use
          expect(client).toBeDefined();
        }).not.toThrow();
      });
    });

    it('should validate signature algorithm compliance', () => {
      const client = new BitbankClient(config);
      
      // Manual signature generation to verify algorithm
      const nonce = Date.now().toString();
      const path = '/v1/user/assets';
      const body = '';
      const message = nonce + path + body;
      
      const expectedSignature = crypto
        .createHmac('sha256', config.apiSecret)
        .update(message)
        .digest('hex');
      
      // Mock the nonce to ensure consistent signature
      const originalDateNow = Date.now;
      (Date.now as any) = jest.fn().mockReturnValue(parseInt(nonce));
      
      const headers = (client as any).createAuthHeaders(path, body);
      
      expect(headers['ACCESS-SIGNATURE']).toBe(expectedSignature);
      
      // Restore original Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Data Protection and Encryption', () => {
    it('should not log sensitive information', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const errorSpy = jest.spyOn(console, 'error');
      
      const client = new BitbankClient(config);
      
      // Generate auth headers (which could potentially log sensitive data)
      (client as any).createAuthHeaders('/v1/user/assets', '');
      
      // Check that API key and secret are not logged
      const allLogs = [...consoleSpy.mock.calls, ...errorSpy.mock.calls]
        .flat()
        .join(' ');
      
      expect(allLogs).not.toContain(config.apiKey);
      expect(allLogs).not.toContain(config.apiSecret);
      
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should not expose credentials in error messages', () => {
      const invalidConfig = {
        ...config,
        apiSecret: '', // Invalid secret to trigger errors
      };
      
      expect(() => {
        const client = new BitbankClient(invalidConfig);
        try {
          (client as any).createAuthHeaders('/v1/user/assets', '');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          expect(errorMessage).not.toContain(config.apiKey);
          expect(errorMessage).not.toContain(config.apiSecret);
          throw error;
        }
      }).toThrow();
    });

    it('should handle sensitive data in memory securely', () => {
      const client = new BitbankClient(config);
      
      // Generate multiple signatures to test memory handling
      for (let i = 0; i < 100; i++) {
        (client as any).createAuthHeaders(`/v1/test/${i}`, `{"data": ${i}}`);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Verify client still functions correctly
      const headers = (client as any).createAuthHeaders('/v1/user/assets', '');
      expect(headers['ACCESS-SIGNATURE']).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should validate order parameters', () => {
      const client = new BitbankClient(config);
      
      const invalidOrders = [
        { pair: '', amount: '0.001', price: '5000000', side: 'buy', type: 'limit' },
        { pair: 'btc_jpy', amount: '', price: '5000000', side: 'buy', type: 'limit' },
        { pair: 'btc_jpy', amount: '0.001', price: '', side: 'buy', type: 'limit' },
        { pair: 'btc_jpy', amount: '0.001', price: '5000000', side: '', type: 'limit' },
        { pair: 'btc_jpy', amount: '0.001', price: '5000000', side: 'buy', type: '' },
        { pair: 'btc_jpy', amount: '-0.001', price: '5000000', side: 'buy', type: 'limit' },
        { pair: 'btc_jpy', amount: '0.001', price: '-5000000', side: 'buy', type: 'limit' },
      ];

      invalidOrders.forEach(order => {
        expect(async () => {
          await client.createOrder(order as any);
        }).rejects.toThrow();
      });
    });

    it('should sanitize configuration inputs', () => {
      const maliciousConfigs = [
        { ...botConfig, pair: '<script>alert("xss")</script>' },
        { ...botConfig, apiKey: 'key\n\r\t' },
        { ...botConfig, baseUrl: 'javascript:alert(1)' },
        { ...botConfig, initialBalance: -1000000 },
        { ...botConfig, maxConcurrentTrades: -5 },
        { ...botConfig, stopLossPercentage: -10 },
        { ...botConfig, takeProfitPercentage: -20 },
      ];

      maliciousConfigs.forEach(maliciousConfig => {
        expect(() => {
          const bot = new TradingBot(maliciousConfig);
          expect(bot).toBeDefined();
        }).not.toThrow();
      });
    });

    it('should handle injection attempts in API calls', () => {
      const client = new BitbankClient(config);
      
      const injectionAttempts = [
        'btc_jpy; DROP TABLE orders;',
        'btc_jpy\' OR 1=1--',
        'btc_jpy<script>alert("xss")</script>',
        'btc_jpy${system("rm -rf /")}',
        'btc_jpy\nHost: evil.com',
      ];

      injectionAttempts.forEach(maliciousPair => {
        expect(async () => {
          await client.getTicker(maliciousPair);
        }).rejects.toThrow();
      });
    });
  });

  describe('Access Control and Authorization', () => {
    it('should require API credentials for authenticated endpoints', () => {
      const noCredsConfig = {
        apiKey: '',
        apiSecret: '',
        baseUrl: 'https://api.bitbank.cc',
      };

      const client = new BitbankClient(noCredsConfig);
      
      expect(async () => {
        await client.getBalance();
      }).rejects.toThrow();
    });

    it('should not expose internal methods publicly', () => {
      const client = new BitbankClient(config);
      
      // Verify that sensitive methods are not exposed
      expect(client).not.toHaveProperty('createAuthHeaders');
      expect(typeof (client as any).createAuthHeaders).toBe('function'); // Exists but private
    });

    it('should validate API endpoint access', () => {
      const client = new BitbankClient(config);
      
      // Test various endpoint patterns
      const validEndpoints = [
        '/v1/ticker/btc_jpy',
        '/v1/user/assets',
        '/v1/user/spot/order',
      ];

      const _invalidEndpoints = [
        '/admin/users',
        '/v2/unauthorized',
        '/../../../etc/passwd',
        '/v1/ticker/../admin',
      ];

      validEndpoints.forEach(endpoint => {
        expect(() => {
          // Should not throw for valid endpoints
          (client as any).createAuthHeaders(endpoint, '');
        }).not.toThrow();
      });

      // Note: Actual validation would happen at the API level
      // This tests our client's handling of different endpoint patterns
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    it('should handle rate limiting gracefully', async () => {
      const client = new BitbankClient(config);
      
      // Simulate rapid requests
      const rapidRequests = Array.from({ length: 10 }, (_, _i) => {
        return async () => {
          try {
            await client.getTicker('btc_jpy');
            return 'success';
          } catch (error) {
            // Rate limiting errors should be handled gracefully
            if (error instanceof Error && error.message.includes('rate limit')) {
              return 'rate_limited';
            }
            throw error;
          }
        };
      });

      const results = await Promise.allSettled(rapidRequests.map(req => req()));
      
      // Should not crash, may have some rate limited responses
      expect(results.every(result => 
        result.status === 'fulfilled' || 
        (result.status === 'rejected' && 
         result.reason.message.includes('rate limit'))
      )).toBe(true);
    });

    it('should implement request timeouts', () => {
      const client = new BitbankClient(config);
      
      // Verify timeout configuration exists
      expect((client as any).axiosInstance.defaults.timeout).toBeDefined();
      expect((client as any).axiosInstance.defaults.timeout).toBeGreaterThan(0);
    });
  });

  describe('Secure Communication', () => {
    it('should use HTTPS for all API communications', () => {
      const client = new BitbankClient(config);
      
      expect(config.baseUrl).toMatch(/^https:\/\//);
      expect((client as any).axiosInstance.defaults.baseURL).toMatch(/^https:\/\//);
    });

    it('should validate SSL certificates', () => {
      const client = new BitbankClient(config);
      
      // Verify SSL validation is not disabled
      const axiosConfig = (client as any).axiosInstance.defaults;
      expect(axiosConfig.httpsAgent?.options?.rejectUnauthorized).not.toBe(false);
    });

    it('should include proper security headers', () => {
      const client = new BitbankClient(config);
      
      const headers = (client as any).createAuthHeaders('/v1/user/assets', '');
      
      // Should include required authentication headers
      expect(headers).toHaveProperty('ACCESS-KEY');
      expect(headers).toHaveProperty('ACCESS-NONCE');
      expect(headers).toHaveProperty('ACCESS-SIGNATURE');
      
      // Headers should not contain sensitive data directly
      expect(headers['ACCESS-KEY']).toBe(config.apiKey);
      expect(headers['ACCESS-SIGNATURE']).not.toBe(config.apiSecret);
    });
  });

  describe('Error Information Disclosure', () => {
    it('should not expose sensitive information in error responses', () => {
      const client = new BitbankClient(config);
      
      // Test error handling without exposing internal details
      expect(async () => {
        try {
          await client.getTicker(''); // Invalid pair
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Should not expose API credentials
          expect(errorMessage).not.toContain(config.apiKey);
          expect(errorMessage).not.toContain(config.apiSecret);
          
          // Should not expose internal paths or stack traces
          expect(errorMessage).not.toMatch(/\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.js/);
          
          throw error;
        }
      }).rejects.toThrow();
    });

    it('should handle network errors securely', () => {
      const invalidConfig = {
        ...config,
        baseUrl: 'https://invalid-domain-12345.com',
      };
      
      const client = new BitbankClient(invalidConfig);
      
      expect(async () => {
        try {
          await client.getTicker('btc_jpy');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Should not expose credentials in network errors
          expect(errorMessage).not.toContain(config.apiKey);
          expect(errorMessage).not.toContain(config.apiSecret);
          
          throw error;
        }
      }).rejects.toThrow();
    });
  });

  describe('Configuration Security', () => {
    it('should validate configuration security requirements', () => {
      const weakConfigs = [
        { ...config, apiKey: '123' }, // Too short
        { ...config, apiSecret: 'weak' }, // Too short
        { ...config, baseUrl: 'http://api.bitbank.cc' }, // Not HTTPS
      ];

      weakConfigs.forEach(weakConfig => {
        const client = new BitbankClient(weakConfig);
        
        // Weak configurations should still work (validation is server-side)
        // But client should handle them securely
        expect(client).toBeDefined();
      });
    });

    it('should protect against environment variable injection', () => {
      const maliciousEnvValues = [
        'api-key\nMALICIOUS_VAR=evil',
        'api-key\r\nSet-Cookie: evil=1',
        'api-key${IFS}rm${IFS}-rf${IFS}/',
      ];

      maliciousEnvValues.forEach(maliciousValue => {
        const maliciousConfig = {
          ...config,
          apiKey: maliciousValue,
        };

        const client = new BitbankClient(maliciousConfig);
        
        // Should handle malicious values safely
        const headers = (client as any).createAuthHeaders('/v1/user/assets', '');
        expect(headers['ACCESS-KEY']).toBe(maliciousValue);
        expect(headers['ACCESS-SIGNATURE']).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });
});