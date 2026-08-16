const DISPLAY_TOKENS: Record<string, string> = {
  "s.pd": "S.Pd",
  "s.kom": "S.Kom",
  "m.pd": "M.Pd",
  "m.kom": "M.Kom",
  "s.t": "S.T",
  "s.h": "S.H",
  "st": "ST",
  "drs.": "Drs.",
  "dr.": "Dr.",
};

const USERNAME_TITLE_TOKENS = new Set([
  "dr",
  "drs",
  "h",
  "hj",
  "spd",
  "skom",
  "mpd",
  "mkom",
  "st",
  "sh",
]);

function titleCaseToken(token: string) {
  const leading = token.match(/^[^\p{L}\p{N}]*/u)?.[0] ?? "";
  const trailing = token.match(/[^\p{L}\p{N}]*$/u)?.[0] ?? "";
  const core = token.slice(leading.length, token.length - trailing.length);
  const special = DISPLAY_TOKENS[core.toLowerCase()];
  if (special) return `${leading}${special}${trailing}`;
  return `${leading}${core
    .toLowerCase()
    .split(/([-'’])/)
    .map((part) => /^[-'’]$/.test(part) ? part : part ? part[0].toUpperCase() + part.slice(1) : part)
    .join("")}${trailing}`;
}

export function normalizeTeacherName(value: string) {
  return value.trim().replace(/\s+/g, " ").split(" ").map(titleCaseToken).join(" ");
}

export function usernameFromTeacherName(value: string) {
  const withoutDegrees = value.split(",")[0];
  const tokens = withoutDegrees.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  return tokens
    .filter((token) => !USERNAME_TITLE_TOKENS.has(token.replace(/[^a-z0-9]/g, "")))
    .join("")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 60);
}

export const usernamePattern = /^[a-z0-9._-]{3,60}$/;
