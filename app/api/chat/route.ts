// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fmpFunctions } from "@/lib/fmp_tools";
import { openai } from "@/lib/openai_client";
import { PLANNER_SYSTEM_PROMPT, SYNTHESIZER_SYSTEM_PROMPT_TEMPLATE } from "./prompts";
import { executeTool } from "./tool-executor";
import { processToolResult } from "./tool-processor";

// Convert our tool definitions to OpenAI format
const openaiTools = fmpFunctions.map(tool => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }
}));

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const userMessage = messages[messages.length - 1];
    console.log("📥 Received user message:", userMessage.content);

    // =================================================================
    // AGENTIC TOOL CHAINING
    // =================================================================
    const conversationHistory = [...messages];
    const allToolsUsed: string[] = [];
    const reasoningTrace: any[] = [];
    let toolStepCounter = 0;
    const maxSteps = 12;
    
    for (let step = 0; step < maxSteps; step++) {
      console.log(`\n🧠 Step ${step + 1}: Planning next action...`);
      
      const plannerResponse = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "system", content: PLANNER_SYSTEM_PROMPT }, ...conversationHistory],
        tools: openaiTools,
        tool_choice: "auto",
        temperature: 0.1,
      });

      const plannerDecision = plannerResponse.choices[0].message;
      if (!plannerDecision.tool_calls?.length) {
        console.log(`✅ Step ${step + 1}: Agent finished. No more tools needed.`);
        break;
      }
      
      conversationHistory.push(plannerDecision);
      const toolResponses = [];
      
      for (const toolCall of plannerDecision.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🚀 Step ${step + 1}: Executing '${toolName}'...`);
        toolStepCounter++;
        allToolsUsed.push(toolName);

        // 1. EXECUTE TOOL using the executor service
        const { toolResult, sourceUrl } = await executeTool(toolName, toolArgs);

        // 2. PROCESS RESULT using the processor service
        const processedToolResult = processToolResult(toolName, toolResult, toolArgs, sourceUrl);

        // 3. LOGGING AND TRACING
        console.log(`✅ Tool result for '${toolName}' processed.`);
        reasoningTrace.push({
          step: toolStepCounter,
          type: 'tool_step',
          toolName: toolName,
          toolArgs: toolArgs,
          result: {
            success: !processedToolResult.error,
            preview: `Object with keys: ${Object.keys(processedToolResult).join(', ')}`
          }
        });
        
        // 4. PREPARE RESPONSE FOR CONVERSATION HISTORY
        toolResponses.push({
          tool_call_id: toolCall.id,
          role: "tool" as const,
          content: JSON.stringify(processedToolResult, null, 2),
        });
      }

      conversationHistory.push(...toolResponses);
      console.log(`📝 Added all tool results to conversation history`);
    }

    console.log(`🎯 Agent execution complete. Used tools: ${allToolsUsed.join(' → ')}`);

    // =================================================================
    // SYNTHESIZER: Create streaming response from conversation history
    // =================================================================
    console.log("✍️ Final Step: Calling Synthesizer LLM...");
    const synthesizerPrompt = SYNTHESIZER_SYSTEM_PROMPT_TEMPLATE.replace('{originalQuestion}', userMessage.content);

    const synthesizerResponse = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "system", content: synthesizerPrompt }, ...conversationHistory],
      temperature: 0.1,
      stream: true,
    });

    // =================================================================
    // STREAMING RESPONSE
    // =================================================================
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const metadata = {
          type: 'metadata',
          toolsUsed: allToolsUsed,
          stepCount: allToolsUsed.length,
          reasoning: reasoningTrace
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`));

        try {
          for await (const chunk of synthesizerResponse) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (error) {
          console.error("Streaming error:", error);
          const errorChunk = { type: 'error', error: error instanceof Error ? error.message : "Unknown error" };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });

  } catch (error) {
    console.error("💥 Error in chat route:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "An error occurred while processing your request", details }, { status: 500 });
  }
}