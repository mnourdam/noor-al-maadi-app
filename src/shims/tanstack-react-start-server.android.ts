// Android SPA builds have no TanStack Start server runtime. This shim keeps
// server-only helpers out of the Capacitor client bundle; any accidental
// client-side execution should fail explicitly instead of pulling SSR code in.
export function getRequest(): undefined {
  return undefined;
}

export function getRequestHeader(): undefined {
  return undefined;
}

export function getRequestHeaders(): Record<string, never> {
  return {};
}