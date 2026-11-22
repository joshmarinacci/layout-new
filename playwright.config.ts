import {defineConfig, devices} from '@playwright/test';

// The end-to-end suite runs against its own Vite dev server, on a port apart from the
// usual 1420 so it never collides with (or reuses state from) a server you have open.
const PORT = 5174;

export default defineConfig({
    testDir: './e2e',
    // *.e2e.ts keeps these out of Vitest, which picks up *.test.* and *.spec.*.
    testMatch: '**/*.e2e.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        viewport: {width: 1280, height: 800},
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 800}}}],
    webServer: {
        command: `npx vite --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
