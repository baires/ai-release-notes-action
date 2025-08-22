module.exports = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/examples/',
    '/__tests__/'
  ],
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  // Minimal coverage thresholds for basic functionality
  // coverageThreshold: {
  //   global: {
  //     branches: 10,
  //     functions: 10,
  //     lines: 10,
  //     statements: 10
  //   }
  // },
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.(test|spec).js',
    '**/*.(test|spec).js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/examples/'
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  moduleFileExtensions: ['js', 'json'],
  transform: {},
  verbose: true
};