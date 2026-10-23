import { describe, expect, it } from "vitest";
import { TemplateError, formatNumber, renderTemplate, validateTemplate } from "./template";

describe("renderTemplate (AC-2)", () => {
  it("substitutes and escapes by default", () => {
    expect(renderTemplate("<p>{{name}}</p>", { name: "Ana <b>\"ë\"</b> & 'ç'" })).toBe(
      "<p>Ana &lt;b&gt;&quot;ë&quot;&lt;/b&gt; &amp; &#39;ç&#39;</p>",
    );
  });
  it("renders raw output only with triple braces", () => {
    expect(renderTemplate("{{{qr}}}|{{qr}}", { qr: "<svg/>" })).toBe("<svg/>|&lt;svg/&gt;");
  });
  it("walks nested paths and renders missing or non-scalar values empty", () => {
    const data = {
      student: { name: "Ana", address: { city: "Tiranë" } },
      n: 0,
      d: new Date("2026-10-23T00:00:00Z"),
      obj: {},
      nothing: null,
    };
    expect(
      renderTemplate(
        "{{student.name}}/{{student.address.city}}/{{n}}/{{d}}/[{{obj}}]/[{{nothing}}]/[{{student.zip}}]/[{{a.b.c}}]",
        data,
      ),
    ).toBe("Ana/Tiranë/0/2026-10-23/[]/[]/[]/[]");
  });
  it("handles if blocks with truthiness rules", () => {
    const t = "{{#if x}}yes{{/if}}{{#if list}}L{{/if}}";
    expect(renderTemplate(t, { x: "a", list: [1] })).toBe("yesL");
    for (const falsy of [{ x: "", list: [] }, { x: 0 }, { x: false }, { x: "false" }, {}])
      expect(renderTemplate(t, falsy)).toBe("");
  });
  it("handles each with this, @index and outer data", () => {
    expect(
      renderTemplate("{{#each items}}{{@index}}:{{this}}:{{title}};{{/each}}", {
        items: ["a", "<"],
        title: "T",
      }),
    ).toBe("0:a:T;1:&lt;:T;");
    expect(
      renderTemplate("{{#each rows}}{{code}}={{name}} {{/each}}", {
        rows: [
          { code: "C1", name: "N1" },
          { code: "C2", name: "N2" },
        ],
      }),
    ).toBe("C1=N1 C2=N2 ");
    expect(
      renderTemplate("{{#each rows}}{{#each cells}}{{@index}}{{this}}{{/each}}|{{/each}}", {
        rows: [{ cells: ["a", "b"] }, { cells: ["c"] }],
      }),
    ).toBe("0a1b|0c|");
    expect(renderTemplate("{{#each nope}}x{{/each}}", {})).toBe("");
  });
  it("cannot reach prototypes or functions", () => {
    expect(
      renderTemplate("{{constructor}}{{__proto__}}{{a.constructor.name}}{{toString}}", { a: {} }),
    ).toBe("");
    expect(renderTemplate("{{x.length}}", { x: "abc" })).toBe(""); // only own properties of objects
  });
  it("does not execute anything in values", () => {
    expect(renderTemplate("{{v}}", { v: "{{secret}}" })).toBe("{{secret}}");
  });
});

describe("validateTemplate", () => {
  it.each([
    ["{{#if a}}x", "unclosedBlock"],
    ["{{/if}}", "unexpectedClose"],
    ["{{#if a}}{{/each}}", "unexpectedClose"],
    ["{{#each}}x{{/each}}", "badTag"],
    ["{{#with a}}x{{/with}}", "badTag"],
    ["{{a b}}", "badTag"],
    ["{{ 1abc }}", "badTag"],
    ["{{#each a}}".repeat(11), "tooDeep"],
  ])("rejects %s", (src, code) => {
    expect(() => validateTemplate(src)).toThrow(TemplateError);
    try {
      validateTemplate(src);
    } catch (e) {
      expect((e as TemplateError).code).toBe(code);
    }
  });
  it("reports the line", () => {
    try {
      validateTemplate("a\nb\n{{#if x}}");
    } catch (e) {
      expect((e as TemplateError).line).toBe(3);
    }
  });
  it("accepts a good template", () =>
    expect(() =>
      validateTemplate("<h1>{{title}}</h1>{{#if a}}{{#each b}}{{this}}{{/each}}{{/if}}"),
    ).not.toThrow());
});

describe("formatNumber (AC-5)", () => {
  it("pads the sequence to five digits", () => {
    expect(formatNumber("CERT", 2026, 7)).toBe("CERT-2026-00007");
    expect(formatNumber("DIP", 2027, 123456)).toBe("DIP-2027-123456");
  });
  it("refuses bad prefixes", () => {
    for (const p of ["", "c", "1AB", "TOOLONGPREFIX", "A-B"])
      expect(() => formatNumber(p, 2026, 1)).toThrow();
  });
});
