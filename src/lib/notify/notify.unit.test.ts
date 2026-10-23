import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import sq from "../../../messages/sq.json";
import { decideChannels, safeLink } from "./channels";
import { escapeHtml, renderMessage } from "./render";
import {
  getNotificationType,
  listNotificationTypes,
  registerNotificationType,
  resetNotificationTypes,
} from "./types";

describe("decideChannels (AC-3)", () => {
  const base = {
    mandatory: false,
    emailable: true,
    userActive: true,
    hasEmail: true,
    emailPreference: undefined,
  };
  it.each([
    ["optional, no preference row: e-mail on", {}, true],
    ["optional, switched off", { emailPreference: false }, false],
    ["optional, switched on", { emailPreference: true }, true],
    ["mandatory ignores an opt-out", { mandatory: true, emailPreference: false }, true],
    ["in-app only type", { emailable: false, mandatory: true }, false],
    ["inactive user", { userActive: false, mandatory: true }, false],
    ["no address", { hasEmail: false, mandatory: true }, false],
  ])("%s", (_n, over, email) => {
    expect(decideChannels({ ...base, ...over })).toEqual({ inApp: true, email });
  });
});

describe("safeLink", () => {
  it.each([
    ["/admin/users", "/admin/users"],
    ["/a?b=1#c", "/a?b=1#c"],
  ])("keeps %j", (v, out) => expect(safeLink(v)).toBe(out));
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:x",
    "",
    null,
    undefined,
    "/a\nb",
  ])("drops %j", (v) => expect(safeLink(v as never)).toBeNull());
});

describe("types registry (AC-1)", () => {
  it("ships plt.test and validates names", () => {
    expect(getNotificationType("plt.test")).toEqual({
      type: "plt.test",
      mandatory: false,
      emailable: true,
    });
    expect(() => registerNotificationType({ type: "Bad Type" })).toThrow(
      /Invalid notification type/,
    );
    registerNotificationType({ type: "fin.reminder", mandatory: true });
    expect(listNotificationTypes().map((t) => t.type)).toEqual(["fin.reminder", "plt.test"]);
    resetNotificationTypes();
    registerNotificationType({ type: "plt.test" });
  });
});

describe("renderMessage (AC-4)", () => {
  const args = {
    type: "plt.test",
    params: { name: "Ana <script>alert(1)</script> & Co" },
    appUrl: "https://app.logos.test",
    link: "/notifications",
  };

  it("renders in the requested locale", () => {
    const albanian = renderMessage({
      ...args,
      params: { name: "Ana" },
      locale: "sq",
      messages: sq,
    });
    const english = renderMessage({ ...args, params: { name: "Ana" }, locale: "en", messages: en });
    expect(albanian.title).toBe("Njoftim provë");
    expect(albanian.subject).toBe("Mesazh prove nga Sekretari Dixhitale");
    expect(english.title).toBe("Test notification");
    expect(english.text).toContain("Hello Ana,");
    expect(english.text).toContain("https://app.logos.test/notifications");
  });

  it("escapes dynamic values in HTML and leaves them plain in text and titles", () => {
    const r = renderMessage({ ...args, locale: "en", messages: en });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("Ana &lt;script&gt;alert(1)&lt;/script&gt; &amp; Co");
    expect(r.body).toContain("<script>"); // in-app text is plain; React escapes it when displayed
    expect(r.html).toContain('<a href="https://app.logos.test/notifications">');
  });

  it("omits the link block without a link and turns newlines into <br>", () => {
    const r = renderMessage({ ...args, link: null, locale: "en", messages: en });
    expect(r.html).not.toContain("<a ");
    expect(r.html).toContain("<br>");
    expect(r.text).not.toContain("http");
  });

  it("fails loudly for an unknown type or a missing key instead of sending a key name", () => {
    expect(() =>
      renderMessage({ ...args, type: "fin.nothing", locale: "en", messages: en }),
    ).toThrow();
    expect(() =>
      renderMessage({ ...args, locale: "en", messages: { notifications: {}, mail: {} } }),
    ).toThrow();
  });

  it("escapeHtml covers the five dangerous characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
