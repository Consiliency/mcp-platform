module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup/jest-setup.js'],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  collectCoverageFrom: [
    'security/**/*.js',
    'config/production/*.js',
    'docker/health/*.js',
    'docker/production/graceful-shutdown.js',
    'monitoring/**/*.js',
    'sdk/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/mocks/**',
    '!**/*.test.js',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};