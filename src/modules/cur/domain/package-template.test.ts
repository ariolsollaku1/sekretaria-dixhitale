import { describe, expect, it } from "vitest";
import { renderTemplate, validateTemplate } from "@/lib/documents/template";
import { SAMPLE_DATA } from "./package-rules";
import { DEFAULT_PACKAGE_TEMPLATES } from "./package-template";

describe("default study package templates (Q-117)", () => {
  for (const language of ["sq", "en"] as const) {
    it(`${language}: validates and renders the plan table`, () => {
      const html = DEFAULT_PACKAGE_TEMPLATES[language];
      expect(() => validateTemplate(html)).not.toThrow();
      const out = renderTemplate(html, {
        ...SAMPLE_DATA,
        number: "PLN-2026-00001",
        issuedDate: "2026-10-24",
        verifyUrl: "http://x/verify/abc",
        qr: "<svg></svg>",
      });
      expect(out).toContain("INF101");
      expect(out).toContain("Hyrje në programim");
      expect(out).toContain("PLN-2026-00001");
      expect(out).toContain("<svg></svg>");
      // one course has a syllabus, one does not, and the total is the sum of both
      expect(out).toContain(language === "sq" ? "Bashkëlidhur" : "Attached");
      expect(out).toContain(language === "sq" ? "Mungon" : "Missing");
      expect(out).toContain("12");
      expect(out).not.toContain("{{");
    });
  }

  it("escapes data written by users", () => {
    const out = renderTemplate(DEFAULT_PACKAGE_TEMPLATES.en, {
      ...SAMPLE_DATA,
      student: { name: "<script>x</script>", number: "1" },
    });
    expect(out).not.toContain("<script>x</script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
