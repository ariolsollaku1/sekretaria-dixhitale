import {
  IdentityProviderError,
  type IdentityAction,
  type IdentityProviderAdmin,
  type IdentityUser,
} from "./identity-provider";

type Stored = IdentityUser & { groups: Set<string>; sessions: number };

/** In-memory identity provider for tests; records what was called so tests can assert on it. */
export class FakeIdentityProvider implements IdentityProviderAdmin {
  readonly users = new Map<string, Stored>();
  readonly emails: { userId: string; actions: IdentityAction[] }[] = [];
  /** Set to make every call fail, e.g. `new IdentityProviderError("UNAVAILABLE", "down")`. */
  failWith: IdentityProviderError | null = null;
  private seq = 0;

  private guard() {
    if (this.failWith) throw this.failWith;
  }

  private get(id: string): Stored {
    const user = this.users.get(id);
    if (!user) throw new IdentityProviderError("NOT_FOUND", "User not found");
    return user;
  }

  private strip({ groups: _g, sessions: _s, ...user }: Stored): IdentityUser {
    return user;
  }

  /** Test helper: a user that exists only in the identity provider. */
  seed(input: { email: string; firstName?: string; lastName?: string }): IdentityUser {
    const user: Stored = {
      id: `kc-${++this.seq}`,
      email: input.email.toLowerCase(),
      firstName: input.firstName ?? "Seed",
      lastName: input.lastName ?? "User",
      enabled: true,
      emailVerified: true,
      groups: new Set(),
      sessions: 1,
    };
    this.users.set(user.id, user);
    return this.strip(user);
  }

  async findUserByEmail(email: string) {
    this.guard();
    const found = [...this.users.values()].find((u) => u.email === email.toLowerCase());
    return found ? this.strip(found) : null;
  }

  async createUser(input: { email: string; firstName: string; lastName: string }) {
    this.guard();
    if (await this.findUserByEmail(input.email))
      throw new IdentityProviderError("CONFLICT", "User exists");
    const user: Stored = {
      id: `kc-${++this.seq}`,
      email: input.email.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      enabled: true,
      emailVerified: false,
      groups: new Set(),
      sessions: 0,
    };
    this.users.set(user.id, user);
    return this.strip(user);
  }

  async updateUser(id: string, patch: { email?: string; firstName?: string; lastName?: string }) {
    this.guard();
    const user = this.get(id);
    if (patch.email !== undefined && patch.email.toLowerCase() !== user.email) {
      user.email = patch.email.toLowerCase();
      user.emailVerified = false;
    }
    if (patch.firstName !== undefined) user.firstName = patch.firstName;
    if (patch.lastName !== undefined) user.lastName = patch.lastName;
    return this.strip(user);
  }

  async setEnabled(id: string, enabled: boolean) {
    this.guard();
    this.get(id).enabled = enabled;
  }

  async executeActionsEmail(id: string, actions: IdentityAction[]) {
    this.guard();
    this.get(id);
    this.emails.push({ userId: id, actions });
  }

  async logoutUser(id: string) {
    this.guard();
    this.get(id).sessions = 0;
  }

  async addToGroup(id: string, groupName: string) {
    this.guard();
    this.get(id).groups.add(groupName);
  }

  async removeFromGroup(id: string, groupName: string) {
    this.guard();
    this.get(id).groups.delete(groupName);
  }

  async listGroups(id: string) {
    this.guard();
    return [...this.get(id).groups];
  }

  async deleteUser(id: string) {
    this.guard();
    this.get(id);
    this.users.delete(id);
  }
}
