// Quick capture: one line of text becomes a task or an inbox item.
// Client-safe. The grammar is small and every recognized token is shown back
// to the person before anything is saved, so a misread is visible.
//
//   Fix login redirect #mythic-labs @claude-code !high due:fri ~3 +bug every week tomorrow
//
//   #project      project by name (fuzzy; quotes for spaces: #"Brand site")
//   @agent        assignee (@me for yourself)
//   !priority     !critical !high !medium !low, or !!! !! !, or p1 p2 p3 p4
//   due:<date>    deadline
//   plan:<date>   the day you will do it; a bare date word (tomorrow, fri, in 3d) means the same
//   ~N or Npt     estimate in points
//   +label        a label
//   every <unit>  recurrence: every day, weekday, week, 2 weeks, month, quarter, year
//   Second and later lines become notes.

import { PRIORITIES, RECURRENCES, addDays, today, type Priority, type Recurrence } from "./projectTypes";

// Only these spellings are weekdays, so "friend" and "monitor" stay words.
const WEEKDAY_FORMS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const WEEKDAY_WORD = "(?:mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date phrase to YYYY-MM-DD, or null when the phrase is not one.
 * Weekday names mean the next such day (never today); "next fri" skips a week.
 */
export function parseDate(raw: string, from = today()): string | null {
  const s = raw.trim().toLowerCase().replace(/^(on|by|at)\s+/, "");
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidDate(s) ? s : null;
  if (s === "today" || s === "tod" || s === "now") return from;
  if (s === "tomorrow" || s === "tmr" || s === "tmrw" || s === "tom") return addDays(from, 1);
  if (s === "yesterday") return addDays(from, -1);
  if (s === "next week" || s === "nextweek") return addDays(from, 7);
  if (s === "next month") return monthsFrom(from, 1);
  if (s === "eow" || s === "end of week") return addDays(from, 7 - ((dow(from) + 6) % 7) - 1 || 7);
  if (s === "eom" || s === "end of month") {
    const d = new Date(`${from}T12:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
  }
  let m = s.match(/^(?:in\s+)?\+?(\d{1,3})\s*(d|days?|w|wks?|weeks?|m|mos?|months?)$/);
  if (m) {
    const n = Number(m[1]);
    if (m[2].startsWith("d")) return addDays(from, n);
    if (m[2].startsWith("w")) return addDays(from, n * 7);
    return monthsFrom(from, n);
  }
  m = s.match(/^(next\s+)?([a-z]+)$/);
  if (m && m[2] in WEEKDAY_FORMS) {
    let ahead = (WEEKDAY_FORMS[m[2]] - dow(from) + 7) % 7;
    if (ahead === 0) ahead = 7;
    if (m[1]) ahead += 7;
    return addDays(from, ahead);
  }
  // "nov 5", "5 nov", "november 5th", "11/5"
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/) || s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})$/);
  if (m) {
    const [a, b] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const month = MONTHS.indexOf(a.slice(0, 3));
    if (month >= 0) return upcoming(from, month, Number(b));
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return upcoming(from, Number(m[1]) - 1, Number(m[2]));
  return null;
}

const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

function isValidDate(s: string): boolean {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function monthsFrom(from: string, n: number): string {
  const d = new Date(`${from}T12:00:00Z`);
  const day = d.getUTCDate();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12));
  const last = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0, 12)).getUTCDate();
  m.setUTCDate(Math.min(day, last));
  return m.toISOString().slice(0, 10);
}

/** The next occurrence of month/day on or after `from` (this year, else next). */
function upcoming(from: string, month: number, day: number): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const y = Number(from.slice(0, 4));
  for (const year of [y, y + 1]) {
    const candidate = new Date(Date.UTC(year, month, day, 12));
    if (candidate.getUTCMonth() !== month) continue;
    const iso = candidate.toISOString().slice(0, 10);
    if (iso >= from) return iso;
  }
  return null;
}

export type ProjectOption = { id: string; name: string };

export type Parsed = {
  title: string;
  notes: string;
  project: ProjectOption | null;
  /** The #token typed when no project matched it. */
  unmatchedProject: string | null;
  agent: string | null;
  priority: Priority | null;
  due_date: string | null;
  planned_for: string | null;
  estimate: number | null;
  labels: string[];
  recurrence: Recurrence | null;
  /** Human-readable account of what was recognized, in order. */
  tokens: Array<{ kind: string; text: string }>;
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Best project for a typed name: exact slug, then prefix, then substring, then subsequence. */
export function matchProject(query: string, projects: ProjectOption[]): ProjectOption | null {
  const q = slugify(query);
  if (!q) return null;
  const scored = projects
    .map((p) => {
      const s = slugify(p.name);
      const score = s === q ? 4 : s.startsWith(q) ? 3 : s.includes(q) ? 2 : subsequence(q, s) ? 1 : 0;
      return { p, score, len: s.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.len - b.len);
  return scored[0]?.p ?? null;
}

function subsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

const RECURRENCE_WORDS: Array<[RegExp, Recurrence]> = [
  [/^(every\s+day|daily|everyday)$/, "daily"],
  [/^(every\s+weekday|weekdays)$/, "weekdays"],
  [/^(every\s+week|weekly)$/, "weekly"],
  [/^(every\s+(2|two)\s+weeks|biweekly|fortnightly)$/, "biweekly"],
  [/^(every\s+month|monthly)$/, "monthly"],
  [/^(every\s+quarter|quarterly)$/, "quarterly"],
  [/^(every\s+year|yearly|annually)$/, "yearly"],
];

const BARE_DATE = new RegExp(`(?:^|\\s)(today|tomorrow|tmrw?|next\\s+week|next\\s+month|eom|eow|in\\s+\\d{1,3}\\s*(?:d|days?|w|wks?|weeks?)|(?:next\\s+)?${WEEKDAY_WORD})(?=\\s|$)`, "i");
// A date after due: or plan: may run to three words: "due:nov 5", "plan:next fri", "due:in 3 days".
const DATE_WORDS = 3;

/** Parse one capture. Nothing here touches the network. */
export function parseQuick(text: string, projects: ProjectOption[], from = today()): Parsed {
  const [first = "", ...restLines] = text.split("\n");
  let line = ` ${first} `;
  const tokens: Parsed["tokens"] = [];
  const out: Parsed = {
    title: "",
    notes: restLines.join("\n").trim(),
    project: null,
    unmatchedProject: null,
    agent: null,
    priority: null,
    due_date: null,
    planned_for: null,
    estimate: null,
    labels: [],
    recurrence: null,
    tokens,
  };
  // Each recognized token is cut out of the line; a handler may hand back words it did not use.
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => string | void) => {
    let m: RegExpMatchArray | null;
    let guard = 0;
    while ((m = line.match(re)) && guard++ < 50) {
      const leftover = fn(m);
      line = line.replace(m[0], ` ${leftover ?? ""} `);
    }
  };
  // "due:nov 5" or "plan:next fri": the longest phrase that reads as a date wins, and the rest stays in the title.
  const dateToken = (kind: "due" | "plan", m: RegExpMatchArray, set: (d: string) => void): string => {
    const words = [m[1], ...m[2].trim().split(/\s+/).filter(Boolean)];
    for (let n = words.length; n >= 1; n--) {
      const d = parseDate(words.slice(0, n).join(" "), from);
      if (d) {
        set(d);
        tokens.push({ kind, text: `${kind} ${d}` });
        return words.slice(n).join(" ");
      }
    }
    tokens.push({ kind: `${kind}?`, text: `can't read date "${m[1]}"` });
    return words.slice(1).join(" ");
  };

  take(/\s#"([^"]+)"|\s#([\w.-]+)/, (m) => {
    const name = m[1] ?? m[2];
    const p = matchProject(name, projects);
    if (p) {
      out.project = p;
      tokens.push({ kind: "project", text: p.name });
    } else {
      out.unmatchedProject = name;
      tokens.push({ kind: "project?", text: `no project matches "${name}"` });
    }
  });
  take(/\s@([\w.-]+)/, (m) => {
    out.agent = m[1];
    tokens.push({ kind: "agent", text: `@${m[1]}` });
  });
  take(/\s!(critical|high|medium|low)\b/i, (m) => {
    out.priority = m[1].toLowerCase() as Priority;
    tokens.push({ kind: "priority", text: out.priority });
  });
  take(/\s(!{1,3})(?=\s)/, (m) => {
    out.priority = (["low", "high", "critical"] as Priority[])[m[1].length - 1] === "low" ? "medium" : m[1].length === 2 ? "high" : "critical";
    tokens.push({ kind: "priority", text: out.priority });
  });
  take(/\sp([1-4])(?=\s)/i, (m) => {
    out.priority = PRIORITIES[Number(m[1]) - 1];
    tokens.push({ kind: "priority", text: out.priority });
  });
  take(new RegExp(`\\s(?:due|by):(\\S+)((?:\\s+\\S+){0,${DATE_WORDS - 1}})`, "i"), (m) => dateToken("due", m, (d) => (out.due_date = d)));
  take(new RegExp(`\\s(?:plan|do|on):(\\S+)((?:\\s+\\S+){0,${DATE_WORDS - 1}})`, "i"), (m) => dateToken("plan", m, (d) => (out.planned_for = d)));
  take(/\s(?:~(\d{1,3})|(\d{1,3})\s?pts?)(?=\s)/i, (m) => {
    out.estimate = Number(m[1] ?? m[2]);
    tokens.push({ kind: "estimate", text: `${out.estimate} pt` });
  });
  take(/\s\+([\w-]+)/, (m) => {
    if (!out.labels.includes(m[1])) out.labels.push(m[1]);
    tokens.push({ kind: "label", text: `+${m[1]}` });
  });
  take(/\s(every\s+(?:day|weekday|week|(?:2|two)\s+weeks|month|quarter|year)|daily|weekdays|weekly|biweekly|fortnightly|monthly|quarterly|yearly|everyday|annually)(?=\s)/i, (m) => {
    const word = m[1].toLowerCase().replace(/\s+/g, " ");
    const rule = RECURRENCE_WORDS.find(([re]) => re.test(word))?.[1] ?? null;
    if (rule && (RECURRENCES as readonly string[]).includes(rule)) {
      out.recurrence = rule;
      tokens.push({ kind: "repeat", text: word });
    }
  });
  // A bare date word plans the day; it only counts when it ends the line or stands alone,
  // so "call tomorrow's customer" keeps its words.
  const bare = line.match(BARE_DATE);
  if (bare && !out.planned_for) {
    const d = parseDate(bare[1], from);
    const after = line.slice((bare.index ?? 0) + bare[0].length).trim();
    if (d && (after === "" || /^(#|@|!|\+|~|due:|plan:)/.test(after))) {
      out.planned_for = d;
      tokens.push({ kind: "plan", text: `plan ${d}` });
      line = line.replace(bare[0], " ");
    }
  }
  out.title = line.replace(/\s+/g, " ").trim();
  return out;
}

/** The body of a task or inbox POST, from a parse. */
export function toTaskFields(p: Parsed) {
  return {
    title: p.title,
    notes: p.notes,
    agent: p.agent,
    priority: p.priority ?? undefined,
    due_date: p.due_date,
    planned_for: p.planned_for,
    estimate: p.estimate,
    labels: p.labels,
    recurrence: p.recurrence,
  };
}

/** Lightweight fuzzy rank for palette rows: prefix beats substring beats subsequence. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const words = t.split(/[\s/:._-]+/);
  if (words.some((w) => w.startsWith(q))) return 70;
  if (t.includes(q)) return 60;
  // Every query word must appear somewhere.
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => t.includes(part))) return 50;
  if (q.length >= 3 && subsequence(q.replace(/\s+/g, ""), t.replace(/\s+/g, ""))) return 20;
  return 0;
}
