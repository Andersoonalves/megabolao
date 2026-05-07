export default {
  displayName: 'backend',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/backend',
  moduleNameMapper: {
    '@nossobolao/shared-types': '<rootDir>/../../libs/shared-types/src/index.ts',
    '@nossobolao/shared-utils': '<rootDir>/../../libs/shared-utils/src/index.ts',
  },
};
