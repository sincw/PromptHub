declare module '@web-runtime-app' {
  import type { ComponentType } from 'react';

  const WebRuntimeApp: ComponentType;
  export default WebRuntimeApp;
}

declare module '@web-runtime-toast-provider' {
  import type { ComponentType, ReactNode } from 'react';

  export const ToastProvider: ComponentType<{ children?: ReactNode }>;
}

declare module '@web-runtime-i18n' {
  const webRuntimeI18n: unknown;
  export default webRuntimeI18n;
}

declare module '@web-runtime-globals-css';
