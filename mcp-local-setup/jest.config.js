module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  maxWorkers: 1,
  clearMocks: true,
  restoreMocks: true,
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/worktrees/'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/worktrees/'
  ]
};