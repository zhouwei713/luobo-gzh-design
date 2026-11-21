import { getCurrentUser, type User } from './authService';
import { isLocalOssDevelopment } from './localDevelopment';
import {notifyDraftOwnerChanged} from './draftScope';

export type ControlMode = 'mock' | 'real' | 'off';
export type DevIdentityRole = 'guest' | User['role'];

export interface FeatureAccess {
  allowed: boolean;
  reason: 'ok' | 'login_required' | 'vip_required';
  message: string;
}

export const DEV_IDENTITY_ROLE_KEY = 'dev_identity_role';

const DEV_IDENTITY_OPTIONS: Array<{ label: string; value: DevIdentityRole }> = [
  { label: '未登录', value: 'guest' },
  { label: '免费用户', value: 'free' },
  { label: 'VIP 用户', value: 'vip' },
  { label: '管理员', value: 'admin' },
];

function normalizeMode(value: string | undefined | null, fallback: ControlMode): ControlMode {
  return value === 'mock' || value === 'real' || value === 'off' ? value : fallback;
}

function normalizeRole(value: string | undefined | null, fallback: DevIdentityRole): DevIdentityRole {
  return value === 'guest' || value === 'free' || value === 'vip' || value === 'admin'
    ? value
    : fallback;
}

export function getAuthMode(): ControlMode {
  const fallback = import.meta.env.VITE_APP_MODE === 'online' ? 'real' : 'mock';
  return normalizeMode(import.meta.env.VITE_AUTH_MODE, fallback);
}

export function getAccessMode(): ControlMode {
  return normalizeMode(import.meta.env.VITE_ACCESS_MODE, getAuthMode());
}

export function getDefaultDevIdentityRole(): DevIdentityRole {
  const fallback = import.meta.env.VITE_APP_MODE === 'online' ? 'guest' : 'vip';
  return normalizeRole(import.meta.env.VITE_DEV_USER_ROLE, fallback);
}

export function loadDevIdentityRole(): DevIdentityRole {
  return normalizeRole(localStorage.getItem(DEV_IDENTITY_ROLE_KEY), getDefaultDevIdentityRole());
}

export function saveDevIdentityRole(role: DevIdentityRole): void {
  localStorage.setItem(DEV_IDENTITY_ROLE_KEY, normalizeRole(role, getDefaultDevIdentityRole()));
  notifyDraftOwnerChanged();
}

export function getDevIdentityOptions(): Array<{ label: string; value: DevIdentityRole }> {
  return DEV_IDENTITY_OPTIONS;
}

export function getRoleLabel(role: DevIdentityRole): string {
  return DEV_IDENTITY_OPTIONS.find((option) => option.value === role)?.label || '未登录';
}

export function shouldShowDevIdentitySwitcher(): boolean {
  return import.meta.env.VITE_APP_MODE === 'oss' && getAuthMode() === 'mock';
}

export function usesRealAuth(): boolean {
  return getAuthMode() === 'real' || isLocalOssDevelopment();
}

function createMockUser(role: DevIdentityRole): User | null {
  if (role === 'guest') return null;

  return {
    id: `dev-${role}`,
    email: `debug+${role}@local.oss`,
    role,
  };
}

function resolveUser(mode: ControlMode, realUser: User | null, devRole: DevIdentityRole): User | null {
  if (mode === 'off') {
    return realUser || createMockUser('admin');
  }

  if (mode === 'mock') {
    return realUser || createMockUser(devRole);
  }

  return realUser;
}

export function getEffectiveUser(
  realUser: User | null = getCurrentUser(),
  devRole: DevIdentityRole = loadDevIdentityRole(),
): User | null {
  return resolveUser(getAuthMode(), realUser, devRole);
}

// 个人API由用户自行配置和承担调用费用，与站点登录和会员身份无关。
// 平台API权益未来单独实现，不能复用这里的放行规则。
export function getAiTypesetAccess(): FeatureAccess {
  return { allowed: true, reason: 'ok', message: '' };
}

export function getIllustrationAccess(): FeatureAccess {
  return { allowed: true, reason: 'ok', message: '' };
}
