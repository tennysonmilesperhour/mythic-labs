// Plan templates: a starting shape for a project's milestones and tasks.
// Client-safe. Applied in one commit by POST /api/projects/:id/template.

import type { Priority } from "./projectTypes";

export type TemplateTask = { title: string; acceptance?: string; labels?: string[]; estimate?: number; priority?: Priority; agent?: "me" | null };
export type TemplateMilestone = { title: string; description?: string; weeks: number; tasks: TemplateTask[] };
export type PlanTemplate = { id: string; name: string; summary: string; milestones: TemplateMilestone[] };

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "product-launch",
    name: "Product launch",
    summary: "Four milestones from a scoped idea to a public release, with the owner steps marked.",
    milestones: [
      {
        title: "Scope",
        description: "Agree on who it is for, what the first version does, and what it will not do.",
        weeks: 1,
        tasks: [
          { title: "Write the one-page brief: audience, problem, first version", agent: "me", estimate: 2, labels: ["docs"] },
          { title: "List the three riskiest assumptions and how to test each", agent: "me", estimate: 2, labels: ["research"] },
          { title: "Decide the stack and record it as a decision", agent: "me", estimate: 1 },
        ],
      },
      {
        title: "Build",
        description: "The thinnest version that a real person can use end to end.",
        weeks: 4,
        tasks: [
          { title: "Repository, CI and deploy pipeline", estimate: 3, labels: ["ops"], acceptance: "A push to main deploys to a preview URL and runs the checks." },
          { title: "Data model and migrations", estimate: 3, labels: ["feature"] },
          { title: "Core flow, end to end", estimate: 8, labels: ["feature"], acceptance: "One person can complete the main job without help." },
          { title: "Auth and accounts", estimate: 5, labels: ["feature"] },
          { title: "Error reporting and logs", estimate: 2, labels: ["ops"] },
        ],
      },
      {
        title: "Private beta",
        description: "Five to ten people use it for real; fix what they hit.",
        weeks: 3,
        tasks: [
          { title: "Invite five beta users", agent: "me", estimate: 1, labels: ["launch"] },
          { title: "Onboarding checklist and welcome email", estimate: 3, labels: ["feature"] },
          { title: "Weekly beta call notes written up", agent: "me", estimate: 1, labels: ["research"] },
          { title: "Fix the top three issues from beta feedback", estimate: 5, labels: ["bug"] },
        ],
      },
      {
        title: "Launch",
        description: "Public, priced, and watched.",
        weeks: 2,
        tasks: [
          { title: "Pricing page and checkout", estimate: 5, labels: ["feature"] },
          { title: "Landing page copy", agent: "me", estimate: 3, labels: ["marketing"] },
          { title: "Analytics events for the core flow", estimate: 2, labels: ["ops"] },
          { title: "Launch post and announcements", agent: "me", estimate: 2, labels: ["marketing"] },
          { title: "Write the launch changelog", estimate: 1, labels: ["docs"] },
        ],
      },
    ],
  },
  {
    id: "website",
    name: "Website",
    summary: "A marketing or brand site from content to launch.",
    milestones: [
      {
        title: "Content",
        weeks: 2,
        tasks: [
          { title: "Site map and page goals", agent: "me", estimate: 2, labels: ["docs"] },
          { title: "Write the home page copy", agent: "me", estimate: 3, labels: ["marketing"] },
          { title: "Collect assets: logos, photos, testimonials", agent: "me", estimate: 2 },
        ],
      },
      {
        title: "Build",
        weeks: 2,
        tasks: [
          { title: "Design system tokens and components", estimate: 3, labels: ["design"] },
          { title: "Home page", estimate: 3, labels: ["feature"] },
          { title: "Inner pages", estimate: 5, labels: ["feature"] },
          { title: "Contact form with spam protection", estimate: 2, labels: ["feature"] },
          { title: "Accessibility and performance pass", estimate: 2, labels: ["ops"], acceptance: "Lighthouse scores above 90 across the board; keyboard navigation works on every page." },
        ],
      },
      {
        title: "Launch",
        weeks: 1,
        tasks: [
          { title: "Domain, DNS and SSL", agent: "me", estimate: 1, labels: ["ops"] },
          { title: "Analytics and search console", estimate: 1, labels: ["ops"] },
          { title: "Final proofread", agent: "me", estimate: 1 },
        ],
      },
    ],
  },
  {
    id: "stabilize",
    name: "Stabilize an existing codebase",
    summary: "For a project that works but hurts: tests, upgrades, monitoring, docs.",
    milestones: [
      {
        title: "Know the ground",
        weeks: 1,
        tasks: [
          { title: "Audit dependencies and list the upgrades", estimate: 2, labels: ["chore"] },
          { title: "Map the critical paths and where they break", estimate: 3, labels: ["research"] },
          { title: "Decide what the definition of done is for this codebase", agent: "me", estimate: 1 },
        ],
      },
      {
        title: "Safety net",
        weeks: 2,
        tasks: [
          { title: "CI running tests and type checks on every push", estimate: 3, labels: ["ops"] },
          { title: "Tests for the top three critical paths", estimate: 5, labels: ["chore"] },
          { title: "Error monitoring wired up", estimate: 2, labels: ["ops"] },
        ],
      },
      {
        title: "Pay it down",
        weeks: 3,
        tasks: [
          { title: "Dependency upgrades, one PR each", estimate: 5, labels: ["chore"] },
          { title: "Remove dead code and feature flags", estimate: 3, labels: ["chore"] },
          { title: "README and setup instructions that a new agent can follow", estimate: 2, labels: ["docs"] },
        ],
      },
    ],
  },
  {
    id: "research-spike",
    name: "Research spike",
    summary: "Time-boxed exploration that ends in a written decision.",
    milestones: [
      {
        title: "Spike",
        description: "Answer one question well enough to decide.",
        weeks: 1,
        tasks: [
          { title: "Write the question and what would settle it", agent: "me", estimate: 1, labels: ["research"] },
          { title: "Prototype the two leading options", estimate: 5, labels: ["research"] },
          { title: "Measure both against the criteria", estimate: 2, labels: ["research"] },
          { title: "Record the decision with alternatives and consequences", agent: "me", estimate: 1, labels: ["docs"] },
        ],
      },
    ],
  },
];
