/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    render(container: Element, options: {
      sitekey: string;
      action: string;
      appearance: 'interaction-only';
      execution: 'execute';
      callback(token: string): void;
      'expired-callback'(): void;
      'error-callback'(): void;
    }): string;
    execute(widgetId: string): void;
    reset(widgetId: string): void;
  };
}
