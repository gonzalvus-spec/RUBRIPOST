/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Token opcional de Rubri Systems cargado desde .env (nunca hardcodeado). */
  readonly VITE_RUBRI_TOKEN?: string;
  /** EID del workspace. Se comparte entre todas las PCs conectadas a la misma MongoDB. */
  readonly VITE_RUBRI_EID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
