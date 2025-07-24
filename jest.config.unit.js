module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup/jest-setup.js'],
  testMatch: [
    '**/tests/unit/config/*.test.js'
  ],
  collectCoverageFrom: [
    'config/production/settings.js',
    'config/production/features.js',
    'config/production/limits.js'
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