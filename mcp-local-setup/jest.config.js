module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/deploy/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    'deploy/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: true
};