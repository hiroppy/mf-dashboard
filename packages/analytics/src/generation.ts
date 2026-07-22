import { generateText, Output, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { generateWithCodexExec } from "./codex-exec.js";
import { getAIBackend, getModel } from "./config.js";

export interface GenerationOptions<T> {
  maxSteps?: number;
  preloadTools?: string[];
  prompt: string;
  schema?: z.ZodType<T>;
  system: string;
  tools?: ToolSet;
}

export interface GenerationResult<T> {
  model: string;
  output: T | undefined;
  text: string;
  toolNames: string[];
}

export async function generate<T>(options: GenerationOptions<T>): Promise<GenerationResult<T>> {
  if (getAIBackend() === "codex") return generateWithCodexExec(options);

  const result = await generateText({
    model: getModel(),
    ...(options.schema ? { output: Output.object({ schema: options.schema }) } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.maxSteps ? { stopWhen: stepCountIs(options.maxSteps) } : {}),
    system: options.system,
    prompt: options.prompt,
  });
  return {
    model: process.env.AI_MODEL!,
    output: result.output as T | undefined,
    text: result.text,
    toolNames: result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
  };
}
