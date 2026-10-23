import {
  IdentityProviderError,
  type IdentityAction,
  type IdentityProviderAdmin,
  type IdentityUser,
} from "./identity-provider";

export type KeycloakAdminConfig = {
  /** Base URL reachable from the server, e.g. http://keycloak:8080 */
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  /** Web client and URL used by "execute actions" emails to send the user back to the app. */
  appClientId: string;
  appRedirectUri: string;
  /** Link lifetime of the email in seconds. */
  emailLifespanSeconds?: number;
};

type KcUser = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  requiredActions?: string[];
};

const toUser = (u: KcUser): IdentityUser => ({
  id: u.id,
  email: (u.email ?? "").toLowerCase(),
  firstName: u.firstName ?? "",
  lastName: u.lastName ?? "",
  enabled: u.enabled ?? false,
  emailVerified: u.emailVerified ?? false,
});

/** Keycloak Admin REST implementation (service account `sekretari-admin`, client credentials). */
export class KeycloakAdmin implements IdentityProviderAdmin {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly groupIds = new Map<string, string>();

  constructor(
    private readonly config: KeycloakAdminConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private get admin() {
    return `${this.config.baseUrl}/admin/realms/${this.config.realm}`;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const res = await this.send(
      `${this.config.baseUrl}/realms/${this.config.realm}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      },
    );
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  /** fetch + error mapping. Network failures and 5xx mean the service is unavailable. */
  private async send(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(url, init);
    } catch {
      throw new IdentityProviderError("UNAVAILABLE", "Identity service unavailable");
    }
    if (res.ok) return res;
    if (res.status === 404)
      throw new IdentityProviderError("NOT_FOUND", "Identity provider resource not found");
    if (res.status === 409)
      throw new IdentityProviderError("CONFLICT", "Identity provider conflict");
    if (res.status >= 500)
      throw new IdentityProviderError("UNAVAILABLE", "Identity service unavailable");
    throw new IdentityProviderError(
      "FAILED",
      `Identity provider rejected the request (${res.status})`,
    );
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    const headers = {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    };
    return this.send(`${this.admin}${path}`, { ...init, headers });
  }

  async findUserByEmail(email: string): Promise<IdentityUser | null> {
    const res = await this.call(`/users?email=${encodeURIComponent(email)}&exact=true`);
    const users = (await res.json()) as KcUser[];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    return match ? toUser(match) : null;
  }

  private async getUser(id: string): Promise<KcUser> {
    return (await (await this.call(`/users/${id}`)).json()) as KcUser;
  }

  async createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<IdentityUser> {
    const email = input.email.toLowerCase();
    const res = await this.call("/users", {
      method: "POST",
      body: JSON.stringify({
        username: email,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        emailVerified: false,
        requiredActions: ["UPDATE_PASSWORD", "VERIFY_EMAIL"],
      }),
    });
    const id = res.headers.get("location")?.split("/").pop();
    if (!id) throw new IdentityProviderError("FAILED", "Identity provider returned no user id");
    return toUser(await this.getUser(id));
  }

  async updateUser(
    id: string,
    patch: { email?: string; firstName?: string; lastName?: string },
  ): Promise<IdentityUser> {
    const current = await this.getUser(id);
    const email = patch.email?.toLowerCase();
    const emailChanged = email !== undefined && email !== (current.email ?? "").toLowerCase();
    await this.call(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...current,
        ...(email !== undefined ? { email, username: email } : {}),
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(emailChanged ? { emailVerified: false } : {}),
      }),
    });
    return toUser(await this.getUser(id));
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const current = await this.getUser(id);
    await this.call(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...current, enabled }),
    });
  }

  async executeActionsEmail(id: string, actions: IdentityAction[]): Promise<void> {
    const q = new URLSearchParams({
      client_id: this.config.appClientId,
      redirect_uri: this.config.appRedirectUri,
      lifespan: String(this.config.emailLifespanSeconds ?? 72 * 3600),
    });
    await this.call(`/users/${id}/execute-actions-email?${q}`, {
      method: "PUT",
      body: JSON.stringify(actions),
    });
  }

  async logoutUser(id: string): Promise<void> {
    await this.call(`/users/${id}/logout`, { method: "POST" });
  }

  private async groupId(name: string): Promise<string> {
    const cached = this.groupIds.get(name);
    if (cached) return cached;
    const res = await this.call(`/groups?search=${encodeURIComponent(name)}&exact=true`);
    const groups = (await res.json()) as { id: string; name: string }[];
    const group = groups.find((g) => g.name === name);
    if (!group) throw new IdentityProviderError("NOT_FOUND", `Group ${name} does not exist`);
    this.groupIds.set(name, group.id);
    return group.id;
  }

  async addToGroup(id: string, groupName: string): Promise<void> {
    await this.call(`/users/${id}/groups/${await this.groupId(groupName)}`, { method: "PUT" });
  }

  async removeFromGroup(id: string, groupName: string): Promise<void> {
    await this.call(`/users/${id}/groups/${await this.groupId(groupName)}`, { method: "DELETE" });
  }

  async listGroups(id: string): Promise<string[]> {
    const groups = (await (await this.call(`/users/${id}/groups`)).json()) as { name: string }[];
    return groups.map((g) => g.name);
  }

  async deleteUser(id: string): Promise<void> {
    await this.call(`/users/${id}`, { method: "DELETE" });
  }
}
