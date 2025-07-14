const { hello, getVersion } = require('../../index');

describe('Harvest4 Basic Tests', () => {
  test('hello function returns correct greeting', () => {
    expect(hello()).toBe('Hello, Harvest4!');
  });

  test('getVersion function returns correct version', () => {
    expect(getVersion()).toBe('1.0.0');
  });

  test('hello function returns a string', () => {
    expect(typeof hello()).toBe('string');
  });

  test('getVersion function returns a string', () => {
    expect(typeof getVersion()).toBe('string');
  });
});