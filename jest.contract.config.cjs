module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/contract/**/*.ts'],
  modulePathIgnorePatterns: [
    '<rootDir>/.cache',
    '<rootDir>/.codex-runtime',
    '<rootDir>/.codex-worktrees',
    '<rootDir>/.artifacts',
  ],
  transformIgnorePatterns: ['/node_modules/'],
};
