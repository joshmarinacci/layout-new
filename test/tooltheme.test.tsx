// @vitest-environment happy-dom
import {act, cleanup, render, renderHook, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {commandRegistry} from '../src/commands';
import {CommandMenuItem} from '../src/common/common';
import type {CommandContext} from '../src/commands';
import {MenuItem} from '../src/ui/controls';
import {DropdownMenu, Separator} from '../src/ui/DropdownMenu';
import {ContextMenu} from '../src/ui/ContextMenu';
import {loadThemeSettings, THEME_STORAGE_KEY, themeMode, useThemeSettings} from '../src/ui/theme';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('theme settings', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('style');
        delete document.documentElement.dataset.theme;
    });

    it('migrates the old mode-only preference', () => {
        localStorage.setItem('layout-editor-theme', 'dark');
        const settings = loadThemeSettings();
        expect(settings.mode).toBe('dark');
        expect(settings.accent).toMatch(/^#/);
        expect(themeMode(settings)).toBe('dark');
    });

    it('treats the old "system" value and missing storage as following the system', () => {
        localStorage.setItem('layout-editor-theme', 'system');
        expect(themeMode(loadThemeSettings())).toBe('system');
        localStorage.clear();
        expect(loadThemeSettings().mode).toBe('');
    });

    it('applies settings to <html>, saves them, and maps Appearance choices onto tooltheme modes', () => {
        const {result} = renderHook(() => useThemeSettings());
        act(() => result.current.setMode('light'));
        expect(document.documentElement.dataset.theme).toBe('light');
        act(() => result.current.setSettings({...result.current.settings, accent: '#f08c2e', contrast: 1.4}));
        expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#f08c2e');
        expect(document.documentElement.style.getPropertyValue('--contrast')).toBe('1.4');
        act(() => result.current.setMode('system'));
        expect(document.documentElement.dataset.theme).toBeUndefined();
        const saved: unknown = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? 'null');
        expect(saved).toMatchObject({accent: '#f08c2e', contrast: 1.4, mode: ''});
    });

    it('has a Theme Settings command that opens the tuner', () => {
        const setThemeSettingsOpen = vi.fn();
        commandRegistry.require('theme-settings').run({setThemeSettingsOpen} as unknown as CommandContext);
        expect(setThemeSettingsOpen).toHaveBeenCalledWith(true);
    });
});

describe('menus use tooltheme semantics', () => {
    it('render a popover holding a labelled menu of menu items', () => {
        render(
            <ContextMenu x={10} y={20} label="Shape actions" onClose={vi.fn()}>
                <MenuItem label="Duplicate" shortcut="⌘D" />
                <Separator />
                <MenuItem label="Delete" variant="danger" />
            </ContextMenu>,
        );
        const menu = screen.getByRole('menu', {name: 'Shape actions'});
        expect(menu.closest('.menu-popover')).not.toBeNull();
        expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Duplicate⌘D', 'Delete']);
        expect(menu.querySelector('kbd')?.textContent).toBe('⌘D');
        expect(screen.getByRole('separator')).toBeTruthy();
        expect(screen.getByRole('menuitem', {name: 'Delete'}).getAttribute('data-variant')).toBe('danger');
    });

    it('opens a dropdown from its button and closes it after an item runs', async () => {
        const user = userEvent.setup();
        const run = vi.fn();
        render(
            <DropdownMenu title="File">
                <MenuItem label="New" onAction={run} />
            </DropdownMenu>,
        );
        const button = screen.getByRole('button', {name: 'File'});
        expect(button.getAttribute('aria-haspopup')).toBe('true');
        await user.click(button);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        await user.click(screen.getByRole('menuitem', {name: 'New'}));
        expect(run).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).toBeNull();
        expect(document.activeElement).toBe(button);
    });

    it('renders command menu items as menu items', () => {
        const ctx = {} as CommandContext;
        render(
            <ContextMenu x={0} y={0} label="Test" onClose={vi.fn()}>
                <CommandMenuItem ctx={ctx} commandId="theme-settings" />
            </ContextMenu>,
        );
        expect(screen.getByRole('menuitem', {name: 'Theme Settings…'})).toBeDefined();
    });
});
