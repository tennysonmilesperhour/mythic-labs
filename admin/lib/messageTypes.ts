// Client-safe types and grouping for Messages: a private inbox between the
// owner and the agents. Writes live in projects.ts; the file is messages.json.

import { ME } from "./taskMap";

/** message: a note either way. report: an agent's run report. needs_you: a step only the owner can do. */
export const MESSAGE_KINDS = ["message", "report", "needs_you"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type Message = {
  id: string;
  /** The first message's id; a new conversation is its own thread. */
  thread_id: string;
  /** "me" for the owner, otherwise the agent's name. */
  author: string;
  kind: MessageKind;
  subject: string;
  body: string;
  created_at: string;
  /** When the owner (for agent messages) or an agent (for owner messages) read it. */
  read_at: string | null;
};

export type MessagesFile = { schemaVersion: 1; items: Message[] };

export type Thread = {
  id: string;
  subject: string;
  kind: MessageKind;
  messages: Message[];
  last_at: string;
  /** Agent messages the owner has not opened. */
  unread: number;
  /** The owner wrote last, so an agent owes a reply. */
  awaiting_agent: boolean;
};

/** Threads newest first, each with its messages oldest first. */
export function groupThreads(items: Message[]): Thread[] {
  const byThread = new Map<string, Message[]>();
  for (const m of items) byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), m]);
  const threads: Thread[] = [];
  byThread.forEach((list, id) => {
    const messages = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = messages[0];
    const last = messages[messages.length - 1];
    threads.push({
      id,
      subject: first.subject || first.body.split("\n")[0].slice(0, 80),
      kind: first.kind,
      messages,
      last_at: last.created_at,
      unread: messages.filter((m) => m.author !== ME && !m.read_at).length,
      awaiting_agent: last.author === ME,
    });
  });
  return threads.sort((a, b) => b.last_at.localeCompare(a.last_at));
}

/** Total unread agent messages, for badges and the overview. */
export function unreadCount(items: Message[]): number {
  return items.filter((m) => m.author !== ME && !m.read_at).length;
}
