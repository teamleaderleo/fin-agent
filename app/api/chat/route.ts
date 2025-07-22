// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fmpFunctions } from "@/lib/fmp_tools";
import { openai } from "@/lib/openai_client";
import { fmpClient } from "@/lib/fmp_client";

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
    // AGENTIC TOOL CHAINING - Execute tools until complete
    // =================================================================
    const conversationHistory = [...messages];
    const allToolsUsed: string[] = [];
    const maxSteps = 5; // Prevent infinite loops
    
    for (let step = 0; step < maxSteps; step++) {
      console.log(`\n🧠 Step ${step + 1}: Planning next action...`);
      
      const plannerResponse = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `You are a financial analyst assistant. The user will ask questions about companies and their finances.

You have access to tools to gather financial data. Think step by step:
1. First, you typically need to resolve company names to ticker symbols using resolveSymbol
2. Then use the appropriate tools to get the requested data
3. Choose the most direct tools for the user's question

If you already have the information needed from previous tool calls, you can stop calling tools.

Available tools: ${fmpFunctions.map(f => f.name).join(', ')}`
          },
          ...conversationHistory
        ],
        tools: openaiTools,
        tool_choice: "auto",
        temperature: 0.1,
      });

      const plannerDecision = plannerResponse.choices[0].message;
      console.log(`🤔 Step ${step + 1} decision:`, {
        hasToolCalls: !!plannerDecision.tool_calls,
        toolCallsCount: plannerDecision.tool_calls?.length || 0,
        content: plannerDecision.content?.substring(0, 100)
      });

      // If no tool call, we're done with the agent loop
      if (!plannerDecision.tool_calls || plannerDecision.tool_calls.length === 0) {
        console.log(`✅ Step ${step + 1}: Agent finished. No more tools needed.`);
        break;
      }

      // Process the first tool call (OpenAI typically returns one at a time in this pattern)
      const toolCall = plannerDecision.tool_calls[0];
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      console.log(`🚀 Step ${step + 1}: Executing '${toolName}' with args:`, toolArgs);
      allToolsUsed.push(toolName);

      // =================================================================
      // TOOL EXECUTOR - Execute the chosen tool
      // =================================================================
      let toolResult: unknown;
      let sourceUrl: string = "";

      switch (toolName) {
        case "resolveSymbol":
          sourceUrl = `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(toolArgs.query)}&limit=10`;
          toolResult = await fmpClient.get("/search-name", { 
            query: toolArgs.query,
            limit: "10"
          });
          break;

        case "listTranscriptDates":
          sourceUrl = `https://financialmodelingprep.com/stable/earning-call-transcript-dates?symbol=${toolArgs.symbol}`;
          toolResult = await fmpClient.get("/earning-call-transcript-dates", { 
            symbol: toolArgs.symbol 
          });
          break;

        case "getTranscript":
          sourceUrl = `https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${toolArgs.symbol}&year=${toolArgs.year}&quarter=${toolArgs.quarter}`;
          toolResult = await fmpClient.get("/earning-call-transcript", {
            symbol: toolArgs.symbol,
            year: toolArgs.year,
            quarter: toolArgs.quarter
          });
          break;

        case "getStatement":
          const statementEndpoint = `/${toolArgs.statement}-statement`;
          const period = toolArgs.period || 'annual';
          const limit = toolArgs.limit || 5;
          sourceUrl = `https://financialmodelingprep.com/stable${statementEndpoint}?symbol=${toolArgs.symbol}&period=${period}&limit=${limit}`;
          toolResult = await fmpClient.get(statementEndpoint, {
            symbol: toolArgs.symbol,
            period: period,
            limit: limit.toString()
          });
          break;

        case "getFinancialGrowth":
          const growthLimit = (Math.max(...(toolArgs.years || [10])) + 1).toString();
          sourceUrl = `https://financialmodelingprep.com/stable/financial-growth?symbol=${toolArgs.symbol}&period=${toolArgs.period || 'annual'}&limit=${growthLimit}`;
          toolResult = await fmpClient.get("/financial-growth", {
            symbol: toolArgs.symbol,
            period: toolArgs.period || 'annual',
            limit: growthLimit
          });
          
          // Add metadata about what was requested
          toolResult = {
            symbol: toolArgs.symbol,
            metric: toolArgs.metric,
            requestedYears: toolArgs.years,
            rawData: toolResult
          };
          break;

        case "getKeyMetrics":
          const metricsLimit = toolArgs.limit || 5;
          sourceUrl = `https://financialmodelingprep.com/stable/key-metrics?symbol=${toolArgs.symbol}&period=annual&limit=${metricsLimit}`;
          toolResult = await fmpClient.get("/key-metrics", {
            symbol: toolArgs.symbol,
            period: 'annual',
            limit: metricsLimit.toString()
          });
          break;

        case "searchNews":
          const symbolsString = Array.isArray(toolArgs.symbols) 
            ? toolArgs.symbols.join(',') 
            : toolArgs.symbols;
          const newsLimit = toolArgs.limit || 20;
          sourceUrl = `https://financialmodelingprep.com/stable/news/stock?symbols=${symbolsString}&limit=${newsLimit}`;
          toolResult = await fmpClient.get("/news/stock", {
            symbols: symbolsString,
            limit: newsLimit.toString()
          });
          break;

        case "getQuote":
          sourceUrl = `https://financialmodelingprep.com/stable/quote?symbol=${toolArgs.symbol}`;
          toolResult = await fmpClient.get("/quote", { 
            symbol: toolArgs.symbol 
          });
          break;

        case "searchTranscripts":
          sourceUrl = "Not implemented";
          toolResult = {
            error: "searchTranscripts not yet implemented",
            suggestion: "Try asking about a specific earnings call using getTranscript"
          };
          break;

        default:
          console.error(`❌ Unknown tool called: ${toolName}`);
          sourceUrl = "Unknown tool";
          toolResult = { error: `Unknown tool: ${toolName}` };
      }

      console.log(`✅ Step ${step + 1}: Tool result preview:`, 
        typeof toolResult === 'object' && toolResult !== null 
          ? Object.keys(toolResult).length > 0 
            ? `Object with keys: ${Object.keys(toolResult).join(', ')}` 
            : 'Empty object'
          : toolResult
      );

      // =================================================================
      // TOOL RESULT PROCESSOR - Clean up results for better parsing
      // =================================================================
      let processedToolResult = toolResult;

      switch (toolName) {
        case "resolveSymbol":
          if (Array.isArray(toolResult) && toolResult.length > 0) {
            const usExchanges = ['NASDAQ', 'NYSE', 'AMEX'];
            let bestResult = toolResult.find(result => 
              usExchanges.includes(result.exchange) && 
              result.currency === 'USD' &&
              !result.symbol.includes('.')
            );
            if (!bestResult) bestResult = toolResult[0];
            
            processedToolResult = {
              query: toolArgs.query,
              found: true,
              ticker: bestResult.symbol,
              companyName: bestResult.name,
              exchange: bestResult.exchange,
              currency: bestResult.currency,
              sourceUrl: sourceUrl,
              toolDescription: "Company Search",
              message: `Found ticker symbol: ${bestResult.symbol} for ${bestResult.name} on ${bestResult.exchange}`
            };
          } else {
            processedToolResult = {
              query: toolArgs.query,
              found: false,
              sourceUrl: sourceUrl,
              toolDescription: "Company Search",
              message: `No ticker symbol found for "${toolArgs.query}"`
            };
          }
          break;
          
        case "getStatement":
          if (Array.isArray(toolResult) && toolResult.length > 0) {
            const statementTypeMap = {
              'income': 'Income Statement API',
              'balance-sheet': 'Balance Sheet API', 
              'cash-flow': 'Cash Flow API'
            };
            
            processedToolResult = {
              symbol: toolArgs.symbol,
              statementType: toolArgs.statement,
              period: toolArgs.period || 'annual',
              recordsFound: toolResult.length,
              mostRecentPeriod: toolResult[0],
              allPeriods: toolResult.slice(0, 3), // Latest 3 periods for context
              sourceUrl: sourceUrl,
              toolDescription: statementTypeMap[String(toolArgs.statement) as keyof typeof statementTypeMap] || 'Financial Statement API'
            };
          } else {
            processedToolResult = {
              symbol: toolArgs.symbol,
              statementType: toolArgs.statement,
              sourceUrl: sourceUrl,
              toolDescription: 'Financial Statement API',
              error: "No financial statements found"
            };
          }
          break;
          
        case "getQuote":
          if (Array.isArray(toolResult) && toolResult.length > 0) {
            processedToolResult = {
              ...toolResult[0],
              sourceUrl: sourceUrl,
              toolDescription: "Stock Quote API"
            };
          }
          break;
          
        // Keep other tools as-is for now
        default:
          if (typeof processedToolResult === 'object' && processedToolResult !== null) {
            processedToolResult = {
              ...processedToolResult,
              sourceUrl: sourceUrl,
              toolDescription: toolName // fallback to function name
            };
          }
      }

      // Add this tool interaction to the conversation history
      conversationHistory.push({
        ...plannerDecision,
        role: "assistant" as const,
      });
      conversationHistory.push({
        tool_call_id: toolCall.id,
        role: "tool" as const,
        content: JSON.stringify(processedToolResult, null, 2),
      });

      console.log(`📝 Step ${step + 1}: Added tool result to conversation history`);
    }

    console.log(`🎯 Agent execution complete. Used tools: ${allToolsUsed.join(' → ')}`);

    // =================================================================
    // SYNTHESIZER: Create final response from conversation history
    // =================================================================
    console.log("✍️ Final Step: Calling Synthesizer LLM...");

    const synthesizerResponse = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `You are a financial analyst. Answer the user's question using the data provided from the tool execution chain.

Rules:
- Be comprehensive and include all relevant financial details from the data
- For each tool used, cite it using the toolDescription and sourceUrl from the tool results
- Use this EXACT citation format: [[toolDescription](sourceUrl)]
- If data is missing or has errors, explain that clearly
- Don't make up information not in the provided data
- Format financial numbers clearly (e.g., $5.8B, 15.2%)

CRITICAL: Look for "toolDescription" and "sourceUrl" fields in the tool results and use them for citations.

The original question was: "${userMessage.content}"`
        },
        ...conversationHistory
      ],
      temperature: 0.1,
    });

    const finalReply = synthesizerResponse.choices[0].message.content;
    console.log("📤 Final reply from Synthesizer:", finalReply?.substring(0, 100) + "...");

    return NextResponse.json({ 
      reply: finalReply,
      toolsUsed: allToolsUsed,
      stepCount: allToolsUsed.length
    });

  } catch (error) {
    console.error("💥 Error in chat route:", error);
    
    if (error instanceof Error) {
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 500)
      });
    }
    
    return NextResponse.json(
      { 
        error: "An error occurred while processing your request",
        details: error instanceof Error ? error.message : "Unknown error"
      }, 
      { status: 500 }
    );
  }
}