import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import viteConfig from '../vite.config';
import {commandRegistry} from '../src/commands';

// These checks keep the Rust shell and the web frontend in agreement. Neither
// side's compiler can see the other, so drift only shows up at runtime inside
// the desktop app, where none of the browser tests run.

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

interface TauriConfig {
    build: {devUrl: string; frontendDist: string};
    app: {windows: {label?: string}[]};
}
interface Capability {
    windows: string[];
    permissions: string[];
}
const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json')) as TauriConfig;
const capability = JSON.parse(read('src-tauri/capabilities/default.json')) as Capability;
const rustSource = read('src-tauri/src/lib.rs');

function sourceFiles(dir: string): string[] {
    return readdirSync(join(root, dir)).flatMap(name => {
        const path = join(dir, name);
        if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(name) ? [path] : [];
    });
}
const frontendSources = sourceFiles('src').map(path => ({path, text: read(path)}));

const kebab = (name: string) => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

describe('Tauri configuration', () => {
    it('points the dev URL at the Vite dev server port', () => {
        expect(new URL(tauriConfig.build.devUrl).port).toBe(String(viteConfig.server?.port));
        expect(viteConfig.server?.strictPort).toBe(true);
    });

    it('bundles the directory Vite builds into', () => {
        expect(tauriConfig.build.frontendDist).toBe(`../${viteConfig.build?.outDir ?? 'dist'}`);
    });

    it('grants the capability to the window the app creates', () => {
        const labels = tauriConfig.app.windows.map(window => window.label ?? 'main');
        expect(capability.windows).toEqual(expect.arrayContaining(labels));
    });
});

describe('native menu', () => {
    const menuIds = [...rustSource.matchAll(/item\("([^"]+)"/g)].map(match => match[1]);

    it('defines menu items', () => {
        expect(menuIds.length).toBeGreaterThan(20);
    });

    const appSource = read('src/app.tsx');
    const nativeOnlyIds = [...appSource.matchAll(/const NATIVE_\w+ = '([^']+)'/g)].map(match => match[1]);

    it('only sends ids that the frontend can handle', () => {
        const unknown = menuIds.filter(id => !commandRegistry.get(id) && !nativeOnlyIds.includes(id));
        expect(unknown).toEqual([]);
    });

    it('offers every command in the web menubar, which the desktop app hides', () => {
        // tauri-mode hides the <header>, so anything only reachable from it would be
        // missing from the desktop app.
        expect(read('src/app.css')).toMatch(/\.app-shell\.tauri-mode > header \{\s*display: none;/);
        const header = appSource.slice(appSource.indexOf('<header>'), appSource.indexOf('</header>'));
        expect(header.length).toBeGreaterThan(0);
        const webIds = [...header.matchAll(/commandId="([^"]+)"/g)].map(match => match[1]);
        // The History group renders {undo} and {redo}, defined outside the header.
        for (const match of header.matchAll(/\{(\w+)\}/g)) {
            const element = appSource.match(new RegExp(`const ${match[1]} = <\\w+ commandId=\\{'([^']+)'\\}`));
            if (element) webIds.push(element[1]);
        }
        expect(webIds).toEqual(expect.arrayContaining(['new-document', 'theme-settings', 'undo', 'redo']));
        expect(webIds.filter(id => !menuIds.includes(id))).toEqual([]);
    });

    it('offers the web menubar actions that are not commands', () => {
        expect(read('src/app.tsx')).toContain('label="Add Google Font…"');
        expect(nativeOnlyIds).toEqual(['add-google-font']);
        expect(menuIds).toContain('add-google-font');
    });

    it('forwards menu clicks on the event the frontend listens for', () => {
        const emitted = rustSource.match(/emit\("([^"]+)"/)?.[1];
        const listened = read('src/app.tsx').match(/listen<string>\('([^']+)'/)?.[1];
        expect(emitted).toBeDefined();
        expect(emitted).toBe(listened);
    });
});

describe('plugin permissions', () => {
    // Map every function a plugin exports to the permission Tauri requires for it,
    // then check each one the frontend calls is granted. A missing permission is
    // rejected at runtime with "not allowed", only inside the desktop app.
    // Names a file takes from `specifier`, through a static import, a destructured
    // `await import(...)`, or a destructured `await Promise.all([import(...), ...])`.
    // Plugins share names (fs and dialog both export `open`), so a plain search for
    // calls is not enough.
    function importedNames(text: string, specifier: string): string[] {
        const names = (list: string) => list.split(',').map(name => name.trim().split(/\s+as\s+/)[0]);
        const quoted = `'${specifier}'`;
        const found: string[] = [];
        for (const match of text.matchAll(/import\s*\{([^{}]*)\}\s*from\s*('[^']+')/g))
            if (match[2] === quoted) found.push(...names(match[1]));
        for (const match of text.matchAll(/\{([^{}]*)\}\s*=\s*await import\(('[^']+')\)/g))
            if (match[2] === quoted) found.push(...names(match[1]));
        for (const match of text.matchAll(/\[([^\]]*)\]\s*=\s*await Promise\.all\(\[([^\]]*)\]\)/g)) {
            const patterns = [...match[1].matchAll(/\{([^{}]*)\}/g)].map(group => group[1]);
            const modules = [...match[2].matchAll(/import\(('[^']+')\)/g)].map(group => group[1]);
            modules.forEach((module, index) => {
                if (module === quoted && patterns[index]) found.push(...names(patterns[index]));
            });
        }
        return found.filter(Boolean);
    }

    async function requiredPermissions(prefix: string, specifier: string) {
        const plugin = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
        return frontendSources.flatMap(file =>
            importedNames(file.text, specifier).map(name => {
                expect(typeof plugin[name], `${file.path} imports ${name} from ${specifier}`).toBe('function');
                return {file: file.path, permission: `${prefix}:allow-${kebab(name)}`};
            }),
        );
    }

    it('reads plugin imports in each style the frontend uses', () => {
        const text = `import {save} from '@tauri-apps/plugin-dialog';
            const {readFile} = await import('@tauri-apps/plugin-fs');
            const [{open}, {readTextFile, writeFile as write}] = await Promise.all([
                import('@tauri-apps/plugin-dialog'),
                import('@tauri-apps/plugin-fs'),
            ]);`;
        expect(importedNames(text, '@tauri-apps/plugin-dialog')).toEqual(['save', 'open']);
        expect(importedNames(text, '@tauri-apps/plugin-fs')).toEqual(['readFile', 'readTextFile', 'writeFile']);
    });

    it.each([
        ['fs', '@tauri-apps/plugin-fs'],
        ['dialog', '@tauri-apps/plugin-dialog'],
    ])('grants every %s function the frontend calls', async (prefix, specifier) => {
        const required = await requiredPermissions(prefix, specifier);
        expect(required.length).toBeGreaterThan(0);
        const missing = required.filter(({permission}) => !capability.permissions.includes(permission));
        expect(missing).toEqual([]);
    });

    it('grants event listening for the native menu', () => {
        expect(capability.permissions).toEqual(
            expect.arrayContaining(['core:event:allow-listen', 'core:event:allow-unlisten']),
        );
    });

    it('registers every Rust command the frontend invokes', () => {
        const invoked = new Set(
            frontendSources.flatMap(file => [...file.text.matchAll(/invoke(?:<[^>]*>)?\('([^']+)'/g)].map(m => m[1])),
        );
        const handler = rustSource.match(/generate_handler!\[([^\]]*)\]/)?.[1] ?? '';
        const registered = handler.split(',').map(name => name.trim());
        expect([...invoked]).not.toHaveLength(0);
        expect([...invoked].filter(name => !registered.includes(name))).toEqual([]);
    });
});
