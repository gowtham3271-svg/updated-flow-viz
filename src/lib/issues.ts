import type { CodeFile } from "@/types";

export type IssueSeverity = "error" | "warning" | "info";

export interface CodeIssue {
  id: string;
  file: string;
  line: number;
  severity: IssueSeverity;
  category: string;
  title: string;
  description: string;
  suggestion: string;
  source: "static" | "ai";
}

interface IssuePattern {
  regex: RegExp;
  severity: IssueSeverity;
  category: string;
  title: string;
  description: string;
  suggestion: string;
}

const PATTERNS: IssuePattern[] = [
  {
    regex: /eval\s*\(/,
    severity: "error",
    category: "Security",
    title: "Use of eval()",
    description: "eval() executes arbitrary code and is a major security risk.",
    suggestion: "Remove eval() and use safe alternatives like JSON.parse() or Function constructor with caution.",
  },
  {
    regex: /SELECT\s+.*\+\s*['"`].*['"`]|SELECT\s+.*\$\{|SELECT\s+.*%s|SELECT\s+.*format\s*\(/i,
    severity: "error",
    category: "Security",
    title: "Potential SQL Injection",
    description: "SQL query uses string concatenation or interpolation, allowing injection attacks.",
    suggestion: "Use parameterized queries or prepared statements instead of string concatenation.",
  },
  {
    regex: /\b(password|passwd|pwd|secret|api_key|apikey|api_secret|private_key|token)\b\s*[:=]\s*['"`][^'"`]{4,}['"`]/i,
    severity: "error",
    category: "Security",
    title: "Hardcoded Secret",
    description: "A password, API key, or secret is hardcoded in the source code.",
    suggestion: "Move secrets to environment variables (.env) and never commit them to version control.",
  },
  {
    regex: /process\.env\.\w+/,
    severity: "info",
    category: "Best Practice",
    title: "Environment Variable Access",
    description: "Code references environment variables. Ensure they are properly validated.",
    suggestion: "Validate environment variables at startup and provide fallback values where appropriate.",
  },
  {
    regex: /Access-Control-Allow-Origin['"`]?\s*[:=]\s*['"`]\*['"`]/i,
    severity: "warning",
    category: "Security",
    title: "CORS Wildcard Origin",
    description: "Access-Control-Allow-Origin is set to *, allowing requests from any domain.",
    suggestion: "Restrict CORS to specific trusted origins instead of using a wildcard.",
  },
  {
    regex: /fetch\s*\([^)]+\)\s*(?!.*\.catch|.*await|.*try)/,
    severity: "warning",
    category: "Reliability",
    title: "Missing Error Handling on fetch()",
    description: "fetch() call has no visible error handling. Network failures will be silent.",
    suggestion: "Wrap fetch() in try/catch or add a .catch() handler to handle network errors gracefully.",
  },
  {
    regex: /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
    severity: "warning",
    category: "Security",
    title: "Insecure HTTP URL",
    description: "Code references an HTTP (not HTTPS) URL, which transmits data unencrypted.",
    suggestion: "Use HTTPS URLs for all external requests to ensure data is encrypted in transit.",
  },
  {
    regex: /console\.(log|debug|info|warn)\s*\(/,
    severity: "info",
    category: "Best Practice",
    title: "Console Statement",
    description: "Console logging left in code. This may leak sensitive data in production.",
    suggestion: "Remove console statements before deploying, or use a logging library with log levels.",
  },
  {
    regex: /innerHTML\s*=/,
    severity: "warning",
    category: "Security",
    title: "innerHTML Assignment",
    description: "Setting innerHTML with user-controlled data can lead to XSS (cross-site scripting).",
    suggestion: "Use textContent for plain text, or sanitize HTML with a library like DOMPurify.",
  },
  {
    regex: /document\.write\s*\(/,
    severity: "warning",
    category: "Security",
    title: "document.write() Usage",
    description: "document.write() can cause XSS and blocks page rendering.",
    suggestion: "Use DOM manipulation methods like createElement and appendChild instead.",
  },
  {
    regex: /\.exec\s*\(\s*['"`]/,
    severity: "error",
    category: "Security",
    title: "Command Injection Risk",
    description: "exec() called with a string can allow command injection if input is user-controlled.",
    suggestion: "Use execFile() with argument arrays instead of exec() with string concatenation.",
  },
  {
    regex: /(?:crypto\.createHash|hashlib\.(md5|sha1))\s*\(/i,
    severity: "warning",
    category: "Security",
    title: "Weak Hash Algorithm",
    description: "MD5 or SHA-1 is used for hashing. These are cryptographically broken.",
    suggestion: "Use SHA-256 or stronger (SHA-512, bcrypt, argon2) for any security-sensitive hashing.",
  },
  {
    regex: /Math\.random\s*\(\s*\)/,
    severity: "warning",
    category: "Security",
    title: "Insecure Random Number",
    description: "Math.random() is not cryptographically secure and should not be used for tokens or keys.",
    suggestion: "Use crypto.getRandomValues() (browser) or crypto.randomBytes() (Node.js) for secure randomness.",
  },
  {
    regex: /(?:req\.|request\.|event\.)(query|body|params|headers)\b/g,
    severity: "info",
    category: "Best Practice",
    title: "Unvalidated User Input",
    description: "User input is accessed but may not be validated or sanitized.",
    suggestion: "Validate and sanitize all user input using a library like zod, joi, or express-validator.",
  },
  {
    regex: /while\s*\(\s*(?:true|1|!0)\s*\)/,
    severity: "warning",
    category: "Reliability",
    title: "Infinite Loop Risk",
    description: "while(true) loop detected. Ensure there is a proper break condition.",
    suggestion: "Add a clear exit condition or break statement to prevent infinite loops.",
  },
  {
    regex: /TODO|FIXME|HACK|XXX/,
    severity: "info",
    category: "Maintenance",
    title: "Unfinished Work",
    description: "A TODO/FIXME marker was found, indicating incomplete or temporary code.",
    suggestion: "Address the TODO/FIXME item and remove the marker when the work is complete.",
  },
];

let issueCounter = 0;
const issueId = () => `issue_${issueCounter++}_${Math.random().toString(36).slice(2, 6)}`;

export function detectIssues(files: CodeFile[]): CodeIssue[] {
  const issues: CodeIssue[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of PATTERNS) {
        if (pattern.regex.test(line)) {
          const alreadyFound = issues.some(
            (iss) => iss.file === file.path && iss.line === i + 1 && iss.title === pattern.title,
          );
          if (!alreadyFound) {
            issues.push({
              id: issueId(),
              file: file.path,
              line: i + 1,
              severity: pattern.severity,
              category: pattern.category,
              title: pattern.title,
              description: pattern.description,
              suggestion: pattern.suggestion,
              source: "static",
            });
          }
        }
      }
    }
  }

  return issues;
}

export function getIssueCounts(issues: CodeIssue[]): { errors: number; warnings: number; info: number } {
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
}
