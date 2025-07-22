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
    // 1. PLANNER: Decide which tool to use (if any)
    // =================================================================
    console.log("🧠 Step 1: Calling Planner LLM...");
    
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

Use tools whenever the user asks about specific companies or financial data.`
        },
        ...messages
      ],
      tools: openaiTools,
      tool_choice: "auto",
      temperature: 0.1,
    });

    const plannerDecision = plannerResponse.choices[0].message;

    // Check if the model decided to call a tool
    if (!plannerDecision.tool_calls || plannerDecision.tool_calls.length === 0) {
      console.log("💭 Planner decided no tool needed. Responding directly.");
      return NextResponse.json({ 
        reply: plannerDecision.content || "I'm not sure how to help with that. Can you ask about a specific company's financial data?"
      });
    }

    // =================================================================
    // 2. EXECUTOR: Execute the chosen tool(s)
    // =================================================================
    const toolCall = plannerDecision.tool_calls[0]; // Start with first tool call
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments);

    console.log(`🚀 Step 2: Executing tool '${toolName}' with args:`, toolArgs);

    let toolResult: unknown;

    // Execute the tool based on its name
    switch (toolName) {
      case "resolveSymbol":
        console.log("🔍 Resolving symbol for:", toolArgs.query);
        
        // Use search-name endpoint for company names, not search-symbol
        // Get more results to find the best match
        toolResult = await fmpClient.get("/search-name", { 
          query: toolArgs.query,
          limit: "10" // Get multiple results to choose the best one
        });
        
        console.log("🔍 Raw resolveSymbol result:", toolResult);
        break;

      case "listTranscriptDates":
        toolResult = await fmpClient.get("/earning-call-transcript-dates", { 
          symbol: toolArgs.symbol 
        });
        break;

      case "getTranscript":
        toolResult = await fmpClient.get("/earning-call-transcript", {
          symbol: toolArgs.symbol,
          year: toolArgs.year,
          quarter: toolArgs.quarter
        });
        break;

      case "getStatement":
        const statementEndpoint = `/${toolArgs.statement}-statement`;
        toolResult = await fmpClient.get(statementEndpoint, {
          symbol: toolArgs.symbol,
          period: toolArgs.period || 'annual',
          limit: toolArgs.limit || 5
        });
        break;

      case "getFinancialGrowth":
        // Get the raw growth data from FMP
        toolResult = await fmpClient.get("/financial-growth", {
          symbol: toolArgs.symbol,
          period: toolArgs.period || 'annual',
          limit: (Math.max(...(toolArgs.years || [10])) + 1).toString() // Get enough years
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
        toolResult = await fmpClient.get("/key-metrics", {
          symbol: toolArgs.symbol,
          period: 'annual',
          limit: toolArgs.limit || 5
        });
        break;

      case "searchNews":
        const symbolsString = Array.isArray(toolArgs.symbols) 
          ? toolArgs.symbols.join(',') 
          : toolArgs.symbols;
        toolResult = await fmpClient.get("/news/stock", {
          symbols: symbolsString,
          limit: toolArgs.limit || 20
        });
        break;

      case "getQuote":
        toolResult = await fmpClient.get("/quote", { 
          symbol: toolArgs.symbol 
        });
        break;

      case "searchTranscripts":
        // For now, return a placeholder - we'll implement this meta-function later
        toolResult = {
          error: "searchTranscripts not yet implemented",
          suggestion: "Try asking about a specific earnings call using getTranscript"
        };
        break;

      default:
        console.error(`❌ Unknown tool called: ${toolName}`);
        toolResult = { error: `Unknown tool: ${toolName}` };
    }

    console.log("✅ Raw tool execution result:", toolResult);
    // =================================================================
    // 2.5. POST-PROCESSOR: Make tool results synthesizer-friendly
    // =================================================================
    let processedToolResult = toolResult;

    switch (toolName) {
      case "resolveSymbol":
        if (Array.isArray(toolResult) && toolResult.length > 0) {
          // Prefer US exchanges (NASDAQ, NYSE, AMEX) over foreign exchanges
          const usExchanges = ['NASDAQ', 'NYSE', 'AMEX'];
          
          // Look for a US exchange listing first
          let bestResult = toolResult.find(result => 
            usExchanges.includes(result.exchange) && 
            result.currency === 'USD' &&
            !result.symbol.includes('.') // Avoid symbols with dots (foreign listings)
          );
          
          // Fall back to first result if no US listing found
          if (!bestResult) {
            bestResult = toolResult[0];
          }
          
          console.log("🎯 Selected best result:", bestResult);
          
          processedToolResult = {
            query: toolArgs.query,
            found: true,
            ticker: bestResult.symbol,
            companyName: bestResult.name,
            exchange: bestResult.exchange,
            currency: bestResult.currency,
            totalResultsFound: toolResult.length,
            message: `Found ticker symbol: ${bestResult.symbol} for ${bestResult.name} on ${bestResult.exchange}`
          };
        } else if (Array.isArray(toolResult) && toolResult.length === 0) {
          processedToolResult = {
            query: toolArgs.query,
            found: false,
            message: `No ticker symbol found for "${toolArgs.query}"`
          };
        } else {
          processedToolResult = {
            query: toolArgs.query,
            found: false,
            error: "Unexpected response format",
            rawResult: toolResult
          };
        }
        break;
        
      case "getStatement":
        if (Array.isArray(toolResult) && toolResult.length > 0) {
          processedToolResult = {
            symbol: toolArgs.symbol,
            statementType: toolArgs.statement,
            period: toolArgs.period || 'annual',
            recordsFound: toolResult.length,
            mostRecentPeriod: toolResult[0],
            allPeriods: toolResult
          };
        } else {
          processedToolResult = {
            symbol: toolArgs.symbol,
            statementType: toolArgs.statement,
            error: "No financial statements found"
          };
        }
        break;
        
      case "getQuote":
        if (Array.isArray(toolResult) && toolResult.length > 0) {
          const quote = toolResult[0];
          processedToolResult = {
            symbol: quote.symbol,
            price: quote.price,
            change: quote.change,
            changesPercentage: quote.changesPercentage,
            marketCap: quote.marketCap,
            volume: quote.volume,
            timestamp: quote.timestamp || new Date().toISOString()
          };
        } else {
          processedToolResult = {
            error: "No quote data found",
            rawResult: toolResult
          };
        }
        break;
        
      // Keep other tools as-is for now, add preprocessing as needed
      default:
        processedToolResult = toolResult;
    }

    console.log(`📝 Processed ${toolName} result:`, processedToolResult);

    // =================================================================
    // 3. SYNTHESIZER: Respond to the user based on the processed result
    // =================================================================
    console.log("✍️ Step 3: Calling Synthesizer LLM...");

    // Add the tool call and its result to the message history
    const messagesWithToolResult = [
      ...messages,
      {
        ...plannerDecision,
        role: "assistant" as const,
      },
      {
        tool_call_id: toolCall.id,
        role: "tool" as const,
        content: JSON.stringify(processedToolResult, null, 2),
      },
    ];

    const synthesizerResponse = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `You are a financial analyst. Answer the user's question using ONLY the data provided in the tool result.

The tool result has been preprocessed to be clear and structured. 

Rules:
- Be concise and direct
- For every fact or number you mention, cite the source in brackets like [${toolName}]
- If data is missing or has errors, explain that clearly
- Don't make up information not in the provided data
- Format financial numbers clearly (e.g., $5.8B, 15.2%)

The original question was: "${userMessage.content}"`
        },
        ...messagesWithToolResult
      ],
      temperature: 0.1,
    });

    const finalReply = synthesizerResponse.choices[0].message.content;
    console.log("📤 Final reply from Synthesizer:", finalReply);

    return NextResponse.json({ 
      reply: finalReply,
      toolUsed: toolName
    });

  } catch (error) {
    console.error("💥 Error in chat route:", error);
    return NextResponse.json(
      { error: "An error occurred while processing your request" }, 
      { status: 500 }
    );
  }
}