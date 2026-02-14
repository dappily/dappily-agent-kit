import { z } from "zod";
import { HederaAgentKit } from "../agent";

// ── Standardized Output Shape ──────────────────────────────────
// Every action returns this. No exceptions.

export interface ActionSuccess {
  ok: true;
  summary: string;
  txId?: string;
  receipt?: {
    status: string;
  };
  data: Record<string, any>;
}

export interface ActionFailure {
  ok: false;
  error: string;
  details?: string;
}

export type ActionResult = ActionSuccess | ActionFailure;

// ── Action Definition ──────────────────────────────────────────

export interface ActionExample {
  input: Record<string, any>;
  output: ActionResult;
  explanation: string;
}

export type Handler = (
  agent: HederaAgentKit,
  input: any,
) => Promise<ActionResult>;

export interface SimulationResult {
  summary: string;
  estimatedFeeHbar?: number;
  warnings?: string[];
}

export interface Action {
  name: string;
  similes: string[];
  description: string;
  examples: ActionExample[][];
  schema: z.ZodTypeAny;
  simulate?: (agent: HederaAgentKit, input: any) => Promise<SimulationResult>;
  requiresConfirmation?: boolean;
  handler: Handler;
}
