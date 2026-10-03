import { describe, expect, it } from 'vitest';
import { adminLoginHref, safeAdminPath } from './safe-admin-path';

describe('safeAdminPath', () => {
  it('keeps internal admin paths', () => {
    expect(safeAdminPath('/admin/users')).toBe('/admin/users');
    expect(safeAdminPath('/admin/users?page=2')).toBe('/admin/users?page=2');
  });

  it.each([
    undefined,
    '',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example',
    '/admin/../../etc',
    '/admin@evil.example',
    '/admin/login',
    '/onboarding',
    'javascript:alert(1)',
  ])('falls back to /admin for %s', (next) => {
    expect(safeAdminPath(next)).toBe('/admin');
  });
});

describe('adminLoginHref', () => {
  it('returns to the current admin page', () => {
    expect(adminLoginHref('/admin/users?page=2')).toBe(
      '/admin/login?next=%2Fadmin%2Fusers%3Fpage%3D2',
    );
  });

  it('omits unsafe or default destinations', () => {
    expect(adminLoginHref('/admin')).toBe('/admin/login');
    expect(adminLoginHref('//evil.example/admin')).toBe('/admin/login');
  });
});
