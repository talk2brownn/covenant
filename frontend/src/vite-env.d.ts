/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARC_CHAIN_ID?: string;
  readonly VITE_ARC_RPC_URL?: string;
  readonly VITE_DEFAULT_CHAIN_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
