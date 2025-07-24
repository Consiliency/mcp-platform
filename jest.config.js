module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup/jest-setup.js'],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  collectCoverageFrom: [
    'security/**/*.js',
    'scripts/build/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};