import { defineConfig } from 'vitest/config';

const env = process.env;
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    // One shared database: run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: env.TEST_DATABASE_URL ?? 'postgres://expense:expense@127.0.0.1:55439/expense_management_test',
      REDIS_URL: env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15',
      JWT_SECRET: 'test-secret',
      SUPER_ADMIN_EMAILS: 'admin@test.local',
      PUBLIC_URL: 'http://test.local',
      UPLOAD_DIR: '/tmp/expense-test-uploads',
      GMAIL_USER: '',
      GMAIL_APP_PASSWORD: '',
    },
  },
});
