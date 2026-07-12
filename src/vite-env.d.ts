/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_BUILD_ID__: string;
