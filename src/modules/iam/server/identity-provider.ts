// The app talks to the identity provider (Keycloak) only through this interface, so services are
// tested against an in-memory fake and the Keycloak client against the same contract.

export type IdentityUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified: boolean;
};

export type IdentityAction = "UPDATE_PASSWORD" | "VERIFY_EMAIL";

/** Group whose members must use a second factor (Q-18: mandatory for sysadmin). */
export const OTP_GROUP = "require-otp";

export type IdentityProviderErrorCode = "UNAVAILABLE" | "CONFLICT" | "NOT_FOUND" | "FAILED";

export class IdentityProviderError extends Error {
  constructor(
    readonly code: IdentityProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IdentityProviderError";
  }
}

export interface IdentityProviderAdmin {
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  /** Created enabled, email as username, with required actions UPDATE_PASSWORD + VERIFY_EMAIL. */
  createUser(input: { email: string; firstName: string; lastName: string }): Promise<IdentityUser>;
  /** Changing the email resets emailVerified to false. */
  updateUser(
    id: string,
    patch: { email?: string; firstName?: string; lastName?: string },
  ): Promise<IdentityUser>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  /** Sends Keycloak's "execute actions" email (set password / verify email link). */
  executeActionsEmail(id: string, actions: IdentityAction[]): Promise<void>;
  /** Ends all of the user's Keycloak sessions. */
  logoutUser(id: string): Promise<void>;
  addToGroup(id: string, groupName: string): Promise<void>;
  removeFromGroup(id: string, groupName: string): Promise<void>;
  listGroups(id: string): Promise<string[]>;
  deleteUser(id: string): Promise<void>;
}
