import type { Principal, Role } from "@sharebox/shared";

export interface Visitor {
  email: string;
  /** Claim `hd` di Google: presente solo per account Workspace. */
  hostedDomain: string | null;
}

export interface ToolGrant {
  principal: Principal;
  role: Role;
}

const RANK: Record<Role, number> = { use: 1, manage: 2 };

/**
 * Ruolo del visitatore sul tool, o null se non ha accesso.
 * Il proprietario gestisce sempre; tra più condivisioni valide vince il ruolo più alto.
 * Le condivisioni di dominio valgono solo per account Workspace di quel dominio (claim `hd`),
 * non per chiunque abbia un'email con quel suffisso.
 */
export function effectiveRole(visitor: Visitor, ownerEmail: string, grants: readonly ToolGrant[]): Role | null {
  if (visitor.email === ownerEmail) return "manage";
  let best: Role | null = null;
  for (const { principal, role } of grants) {
    if (!matches(visitor, principal)) continue;
    if (best === null || RANK[role] > RANK[best]) best = role;
  }
  return best;
}

function matches(visitor: Visitor, principal: Principal): boolean {
  switch (principal.type) {
    case "anyone":
      return true;
    case "user":
      return principal.email === visitor.email;
    case "domain":
      return visitor.hostedDomain !== null && principal.domain === visitor.hostedDomain;
  }
}
