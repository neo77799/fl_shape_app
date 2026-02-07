/// <reference types="vite/client" />

declare global {
  interface Window {
    app?: {
      ping: () => string;
    };
  }
}

export {};

