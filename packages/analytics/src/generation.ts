import { generateText, Output, type StepResult, type ToolSet } from "ai";
import { z } from "zod";
import { generateWithCodexAppServer } from "./codex-app-server.js";
import { getAIBackend, getModel } from "./config.js";

interface GenerateOptions<T> {
  system: string;
  prompt: string;
  schema?: z.ZodType<T>;
  tools?: ToolSet;
  stopWhen?: Parameters<typeof generateText>[0]["stopWhen"];
  maxToolCalls?: number;
}

export interface GenerateResult<T> {
  text: string;
  output: T | undefined;
  stepCount: number;
  toolNames: string[];
}

export async function generateWithConfiguredBackend<T>(
  options: GenerateOptions<T>,
): Promise<GenerateResult<T>> {
  if (getAIBackend() === "codex-app-server") {
    const result = await generateWithCodexAppServer({
      system: options.system,
      prompt: options.prompt,
      schema: options.schema,
      tools: options.tools as never,
      maxToolCalls: options.maxToolCalls,
    });
    return {
      ...result,
      stepCount: result.toolNames.length + 1,
    };
  }

  const result = await generateText({
    model: getModel(),
    system: options.system,
    prompt: options.prompt,
    tools: options.tools,
    stopWhen: options.stopWhen,
    output: options.schema ? Output.object({ schema: options.schema }) : undefined,
  });
  return {
    text: result.text,
    output: result.output as T | undefined,
    stepCount: result.steps.length,
    toolNames: result.steps.flatMap((step: StepResult<ToolSet>) =>
      step.toolCalls.map((toolCall) => toolCall.toolName),
    ),
  };
}
