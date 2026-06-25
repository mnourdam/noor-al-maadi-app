import { z } from "zod";
import type { GameMode } from "./types";

const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "slug must be kebab-case ASCII");

const relatedEntities = z.array(z.string().min(1)).default([]);

const baseEnvelope = z.object({
  slug,
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  difficulty: z.number().int().min(1).max(5).default(1),
  estimated_time: z.number().int().min(1).max(120).default(5),
  xp: z.number().int().min(0).max(10000).default(50),
  coins: z.number().int().min(0).max(10000).default(20),
  hearts_penalty: z.number().int().min(0).max(5).default(1),
  related_entities: relatedEntities,
  metadata: z.record(z.unknown()).default({}),
});

// ---- Stage schemas ---------------------------------------------------------

const crosswordClue = z.object({
  number: z.number().int().min(1),
  direction: z.enum(["across", "down"]),
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  answer: z.string().min(1).max(40),
  hint: z.string().min(1).max(300),
  related: z.string().optional(),
});

const crosswordStage = z.object({
  title: z.string().optional(),
  rows: z.number().int().min(3).max(25),
  cols: z.number().int().min(3).max(25),
  clues: z.array(crosswordClue).min(1).max(60),
});

const chronologyEvent = z.object({
  label: z.string().min(1).max(200),
  year: z.number().int().min(-3000).max(3000),
  era: z.string().optional(),
  related: z.string().optional(),
});

const chronologyStage = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
  events: z.array(chronologyEvent).min(3).max(12),
});

const whoAmIStage = z.object({
  title: z.string().optional(),
  hints: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  answer: z.string().min(1).max(100),
  acceptable: z.array(z.string().min(1)).default([]),
  related: z.string().optional(),
});

const connectionsStage = z.object({
  title: z.string().optional(),
  pairs: z
    .array(
      z.object({
        left: z.string().min(1),
        right: z.string().min(1),
        relation: z.string().min(1),
        related: z.string().optional(),
      }),
    )
    .min(3)
    .max(12),
});

const memoryStage = z.object({
  title: z.string().optional(),
  pairs: z
    .array(
      z.object({
        a: z.string().min(1),
        b: z.string().min(1),
        relation: z.string().optional(),
        related: z.string().optional(),
      }),
    )
    .min(3)
    .max(12),
});

const stageSchemas = {
  crossword: crosswordStage,
  chronology: chronologyStage,
  who_am_i: whoAmIStage,
  connections: connectionsStage,
  memory: memoryStage,
} as const;

export function envelopeSchemaFor(mode: GameMode) {
  return baseEnvelope.extend({
    mode: z.literal(mode),
    stages: z.array(stageSchemas[mode]).min(1).max(20),
  });
}

export function validateGameJson(
  mode: GameMode,
  raw: unknown,
):
  | { ok: true; value: z.infer<ReturnType<typeof envelopeSchemaFor>> }
  | { ok: false; errors: string[] } {
  const parsed = envelopeSchemaFor(mode).safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors = parsed.error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
  );
  return { ok: false, errors };
}
