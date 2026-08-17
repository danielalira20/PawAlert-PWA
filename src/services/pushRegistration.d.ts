export type PushPermissionState =
  | 'unsupported'
  | 'default'
  | 'denied'
  | 'granted';

export function getPushPermissionState(): Promise<PushPermissionState>;

export function enablePushNotifications(
  accessToken: string,
): Promise<{ permission: PushPermissionState }>;

export function disablePushNotifications(
  accessToken: string,
): Promise<{ permission: PushPermissionState }>;
