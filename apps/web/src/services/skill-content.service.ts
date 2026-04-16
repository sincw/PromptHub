import type { SkillSafetyFinding, SkillSafetyLevel, SkillSafetyReport } from '@prompthub/shared';

const BLOCK_PATTERNS = [
  {
    code: 'shell-pipe-exec',
    title: 'Detected pipe-to-shell execution',
    detail: 'The skill content downloads remote content and pipes it directly into a shell.',
    regex: /\b(?:curl|wget)\b[\s\S]{0,120}?\|\s*(?:sh|bash|zsh|fish|pwsh|powershell)\b/i,
  },
  {
    code: 'dangerous-delete',
    title: 'Detected destructive delete command',
    detail: 'The skill content contains a destructive delete command targeting root-level or wildcard paths.',
    regex: /\brm\s+-rf\s+(?:\/|\~\/|\$\w+\/|\*)/i,
  },
  {
    code: 'encoded-shell-bootstrap',
    title: 'Detected encoded shell bootstrap',
    detail: 'The skill content contains an encoded payload that is decoded and immediately executed.',
    regex: /\bbase64\b[\s\S]{0,120}?(?:-d|--decode)[\s\S]{0,80}?\|\s*(?:sh|bash|zsh|python|node)\b/i,
  },
];

const HIGH_RISK_PATTERNS = [
  {
    code: 'privilege-escalation',
    title: 'Requests elevated privileges',
    detail: 'The skill content invokes sudo or another elevated execution path.',
    regex: /\bsudo\b/i,
  },
  {
    code: 'system-persistence',
    title: 'Touches persistence or system service mechanisms',
    detail: 'The skill content refers to launch agents, cron jobs, scheduled tasks, or system services.',
    regex: /\b(?:launchctl|systemctl|service\s+\w+|crontab|schtasks)\b/i,
  },
  {
    code: 'secret-access',
    title: 'Reads secret-bearing paths',
    detail: 'The skill content references files that commonly contain credentials or private keys.',
    regex: /(?:\.env\b|id_rsa\b|id_ed25519\b|\.ssh\/|aws\/credentials|\.npmrc\b|\.pypirc\b)/i,
  },
  {
    code: 'security-bypass',
    title: 'Suggests bypassing approvals or sandboxing',
    detail: 'The skill content includes language about disabling approvals, bypassing sandboxing, or suppressing security prompts.',
    regex: /\b(?:disable|bypass|suppress|ignore)\b[\s\S]{0,40}?\b(?:approval|permission|sandbox|security)\b/i,
  },
];

const WARN_PATTERNS = [
  {
    code: 'network-bootstrap',
    title: 'Downloads remote resources',
    detail: 'The skill content downloads remote resources or bootstrap scripts.',
    regex: /\b(?:curl|wget|Invoke-WebRequest)\b/i,
  },
  {
    code: 'env-mutation',
    title: 'Mutates shell environment or startup files',
    detail: 'The skill content edits shell rc files or environment variables, which may have long-lived effects.',
    regex: /\b(?:\.zshrc|\.bashrc|\.profile|export\s+[A-Z_][A-Z0-9_]*)\b/i,
  },
  {
    code: 'exec-bit',
    title: 'Modifies executable permissions',
    detail: 'The skill content changes file permissions, which deserves review.',
    regex: /\bchmod\b[\s\S]{0,40}?(?:777|755|\+x)(?:\b|\s|$)/i,
  },
];

export interface ParsedRemoteSkill {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  body: string;
  raw: string;
}

function pushFinding(findings: SkillSafetyFinding[], finding: SkillSafetyFinding): void {
  const key = [finding.code, finding.severity, finding.evidence ?? ''].join('::');
  const exists = findings.some((item) => [item.code, item.severity, item.evidence ?? ''].join('::') === key);
  if (!exists) {
    findings.push(finding);
  }
}

function scanWithPatterns(
  text: string,
  patterns: Array<{ code: string; title: string; detail: string; regex: RegExp }>,
  severity: 'warn' | 'high',
  findings: SkillSafetyFinding[],
): void {
  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match) {
      continue;
    }

    pushFinding(findings, {
      code: rule.code,
      severity,
      title: rule.title,
      detail: rule.detail,
      evidence: match[0].slice(0, 160),
      filePath: 'SKILL.md',
    });
  }
}

function deriveLevel(findings: SkillSafetyFinding[]): SkillSafetyLevel {
  if (findings.some((finding) => ['shell-pipe-exec', 'dangerous-delete', 'encoded-shell-bootstrap'].includes(finding.code))) {
    return 'blocked';
  }
  if (findings.some((finding) => finding.severity === 'high')) {
    return 'high-risk';
  }
  if (findings.some((finding) => finding.severity === 'warn')) {
    return 'warn';
  }
  return 'safe';
}

function buildSummary(level: SkillSafetyLevel, findings: SkillSafetyFinding[]): string {
  if (level === 'safe') {
    return 'No obvious malicious patterns were detected in the skill content.';
  }

  const highCount = findings.filter((finding) => finding.severity === 'high').length;
  const warnCount = findings.filter((finding) => finding.severity === 'warn').length;
  return `Detected ${highCount} high-risk and ${warnCount} warning findings in the skill content.`;
}

export function scanSkillContent(content: string): SkillSafetyReport {
  const findings: SkillSafetyFinding[] = [];

  scanWithPatterns(content, BLOCK_PATTERNS, 'high', findings);
  scanWithPatterns(content, HIGH_RISK_PATTERNS, 'high', findings);
  scanWithPatterns(content, WARN_PATTERNS, 'warn', findings);

  const level = deriveLevel(findings);

  return {
    level,
    findings,
    recommendedAction: level === 'blocked' ? 'block' : level === 'high-risk' ? 'review' : 'allow',
    scannedAt: Date.now(),
    checkedFileCount: 1,
    scanMethod: 'static',
    summary: buildSummary(level, findings),
    score: level === 'safe' ? 95 : level === 'warn' ? 65 : level === 'high-risk' ? 35 : 5,
  };
}

export function parseRemoteSkill(content: string): ParsedRemoteSkill {
  const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/);
  if (!frontmatterMatch) {
    return {
      body: content.trim(),
      raw: content,
    };
  }

  const frontmatterLines = frontmatterMatch[1].split(/\r?\n/);
  const parsed: ParsedRemoteSkill = {
    body: content.slice(frontmatterMatch[0].length).trim(),
    raw: content,
  };

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      if (key === 'tags') {
        parsed.tags = items;
      }
      continue;
    }

    if (key === 'name') {
      parsed.name = value;
    } else if (key === 'description') {
      parsed.description = value;
    } else if (key === 'version') {
      parsed.version = value;
    } else if (key === 'author') {
      parsed.author = value;
    } else if (key === 'tags' && !parsed.tags) {
      parsed.tags = value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return parsed;
}
