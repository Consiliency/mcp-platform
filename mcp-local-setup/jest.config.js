module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  maxWorkers: 1,
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
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
  modulePathIgnorePatterns: [
    '<rootDir>/worktrees/'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/worktrees/'
  ]
};