import { expect, test, describe } from "vitest";
import { calculateScore, CATEGORY_WEIGHTS, getGrade } from "./scoring";
import { Finding } from "./types";

describe("Scoring", () => {
  test("weights sum to 100", () => {
    const sum = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  test("perfect score with no findings", () => {
    const result = calculateScore([]);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("Production Ready");
  });

  test("floors at zero for a category", () => {
    const result = calculateScore([
      { id: "1", category: "security", severity: "critical" } as Finding,
      { id: "2", category: "security", severity: "high" } as Finding,
    ]);
    expect(result.categoryScores.security).toBe(0);
  });

  test("cap rule: critical finding caps total at 49", () => {
    const result = calculateScore([
      { id: "1", category: "mobile", severity: "critical" } as Finding, // -10 from 100 -> 90
    ]);
    expect(result.score).toBe(49);
    expect(result.grade).toBe("Vibes Only");
  });

  test("grade bands", () => {
    expect(getGrade(100)).toBe("Production Ready");
    expect(getGrade(85)).toBe("Production Ready");
    expect(getGrade(84)).toBe("Almost Shippable");
    expect(getGrade(65)).toBe("Almost Shippable");
    expect(getGrade(64)).toBe("Vibes Only");
    expect(getGrade(40)).toBe("Vibes Only");
    expect(getGrade(39)).toBe("Vaporware");
    expect(getGrade(0)).toBe("Vaporware");
  });

  test("deductions work correctly across categories", () => {
    const result = calculateScore([
      { id: "1", category: "performance", severity: "high" } as Finding, // 15 * 0.4 = 6. 15-6 = 9
      { id: "2", category: "polish", severity: "low" } as Finding, // 10 * 0.08 = 0.8. 10-0.8 = 9.2
    ]);
    expect(result.categoryScores.performance).toBe(9);
    expect(result.categoryScores.polish).toBe(9.2);
    // 30 + 25 + 9 + 10 + 10 + 9.2 = 93.2 -> 93
    expect(result.score).toBe(93);
    expect(result.grade).toBe("Production Ready");
  });
});
