export type RecentAccountAuthenticationGate =
  | { enforcement: 'inactive' }
  | { enforcement: 'deny'; reason: 'recent_account_authentication_unavailable' };

/** Unconnected foundation: no provider currently supplies trusted original-authentication evidence. */
export function recentAccountAuthenticationGate(activated = false): RecentAccountAuthenticationGate {
  return activated === false
    ? { enforcement: 'inactive' }
    : { enforcement: 'deny', reason: 'recent_account_authentication_unavailable' };
}
