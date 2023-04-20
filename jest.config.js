export default {
  testMatch: ['<rootDir>/src/**/*.test.ts'],

  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2022',
        },
      },
    ],
  },
};
