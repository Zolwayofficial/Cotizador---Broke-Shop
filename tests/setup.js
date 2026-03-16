// tests/setup.js
// Configuración global de tests

const { jest } = require('@jest/globals');

// Timeout global para tests
jest.setTimeout(30000);

// Variables globales
global.TEST_CONFIG = {
  PORT: 3001, // Puerto diferente para tests
  API_URL: 'http://localhost:3001',
  GROQ_API_KEY: process.env.GROQ_API_KEY || 'test-key'
};

// Mock de consola para tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Cleanup después de cada test
afterEach(() => {
  jest.clearAllMocks();
});
