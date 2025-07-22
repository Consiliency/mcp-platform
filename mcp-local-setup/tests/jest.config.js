/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '../',
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/examples/'
  ],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '<rootDir>/cli/**/*.js',
    '<rootDir>/scripts/**/*.js',
    '<rootDir>/dashboard/**/*.js',
    '!<rootDir>/cli/setup.js',
    '!<rootDir>/**/*.test.js',
    '!<rootDir>/**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  verbose: true,
  testTimeout: 30000,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true
};