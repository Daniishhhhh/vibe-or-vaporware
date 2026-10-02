export type Category = 
  | "security"
  | "reliability"
  | "performance"
  | "mobile"
  | "accessibility"
  | "polish";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;                // stable, e.g. "sec.secret.openai"
  category: Category;
  severity: Severity;
  title: string;             // plain English
  evidence: string;          // short and REDACTED
  whyItMatters: string;      // 1-2 sentences for a non-technical reader
  fix: string;               // 2-4 plain steps
  fixPrompt: string;         // ready-to-paste prompt for any AI coding tool
  confidence: "high" | "medium" | "low";
  visibility: "public" | "private";   // critical secret findings are "private"
}

export interface ScanContext {
  // Placeholder for evidence to be collected
  html?: string;
  headers?: Record<string, string>;
  cookies?: any[];
  bundleTexts?: string[];
  consoleLogs?: any[];
  networkLogs?: any[];
  psiResult?: any;
}

export interface ScanResult {
  score: number;
  grade: string;
  categoryScores: Record<Category, number>;
  findings: Finding[];
  roast: string;
}
