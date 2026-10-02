import { Category, Finding, Severity } from "./types";

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  security: 30,
  reliability: 25,
  performance: 15,
  mobile: 10,
  accessibility: 10,
  polish: 10,
};

const SEVERITY_DEDUCTIONS: Record<Severity, number> = {
  critical: 1.0,
  high: 0.4,
  medium: 0.2,
  low: 0.08,
  info: 0,
};

export function getGrade(score: number): string {
  if (score >= 85) return "Production Ready";
  if (score >= 65) return "Almost Shippable";
  if (score >= 40) return "Vibes Only";
  return "Vaporware";
}

export function calculateScore(findings: Finding[]): {
  score: number;
  grade: string;
  categoryScores: Record<Category, number>;
} {
  const categoryScores = { ...CATEGORY_WEIGHTS };
  let hasCritical = false;

  for (const finding of findings) {
    if (finding.severity === "critical") {
      hasCritical = true;
    }
    const deductionPct = SEVERITY_DEDUCTIONS[finding.severity];
    const deductionAmount = CATEGORY_WEIGHTS[finding.category] * deductionPct;
    categoryScores[finding.category] = Math.max(0, categoryScores[finding.category] - deductionAmount);
  }

  let totalScore = 0;
  for (const cat in categoryScores) {
    totalScore += categoryScores[cat as Category];
  }
  
  totalScore = Math.round(totalScore);

  if (hasCritical && totalScore > 49) {
    totalScore = 49;
  }

  return {
    score: totalScore,
    grade: getGrade(totalScore),
    categoryScores,
  };
}
