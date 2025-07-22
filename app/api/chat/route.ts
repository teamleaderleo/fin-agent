// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fmpFunctions } from "@/lib/fmp_tools";
import { openai } from "@/lib/openai_client";
import { fmpClient } from "@/lib/fmp_client";

const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY

// Helper function to search transcript content for topics and executives
function searchTranscriptContent(content: string, topic: string, executives: string[], symbol: string, dateInfo: any) {
  interface TranscriptMention {
    topic: string;
    speaker: string;
    context: string;
    matchCount: number;
    relevanceScore: number;
  }

  const mentions: TranscriptMention[] = [];
  
  if (!content || !topic) return mentions;
  
  // Split content into paragraphs for better context extraction
  const paragraphs = content.split('\n').filter(p => p.trim().length > 50);
  
  // Create case-insensitive regex for topic search
  const topicRegex = new RegExp(topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  
  // Search each paragraph for topic mentions
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const matches = paragraph.match(topicRegex);
    
    if (matches && matches.length > 0) {
      // Extract context (current paragraph + some surrounding context)
      const contextStart = Math.max(0, i - 1);
      const contextEnd = Math.min(paragraphs.length - 1, i + 1);
      const context = paragraphs.slice(contextStart, contextEnd + 1).join('\n');
      
      // Try to identify the speaker if executives are specified
      let speaker = "Unknown";
      let executiveMatch = false;
      
      if (executives.length > 0) {
        // Look for executive names in the current and surrounding paragraphs
        const searchArea = paragraphs.slice(Math.max(0, i - 3), i + 1).join('\n');
        
        for (const exec of executives) {
          const execRegex = new RegExp(exec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          if (execRegex.test(searchArea)) {
            speaker = exec;
            executiveMatch = true;
            break;
          }
        }
        
        // If no specific executive match and we're filtering by executives, skip this mention
        if (!executiveMatch && executives.length > 0) {
          continue;
        }
      } else {
        // Try to extract speaker from common patterns like "John Smith:" or "CEO:"
        const speakerMatch = paragraph.match(/^([A-Z][a-zA-Z\s]+(?:CEO|CFO|President|Officer|Director)?)[:\-]/);
        if (speakerMatch) {
          speaker = speakerMatch[1].trim();
        }
      }
      
      mentions.push({
        topic: topic,
        speaker: speaker,
        context: context.substring(0, 800), // Limit context length
        matchCount: matches.length,
        relevanceScore: calculateRelevanceScore(paragraph, topic, executives)
      });
    }
  }
  
  // Sort by relevance score and return top mentions
  return mentions.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
}

// Helper function to calculate relevance score for ranking results
function calculateRelevanceScore(text: string, topic: string, executives: string[]): number {
  let score = 0;
  
  // Base score for topic mentions (10 points per mention)
  const topicRegex = new RegExp(topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const topicMatches = text.match(topicRegex);
  score += (topicMatches?.length || 0) * 10;
  
  // Bonus for executive mentions (20 points each)
  for (const exec of executives) {
    const execRegex = new RegExp(exec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (execRegex.test(text)) {
      score += 20;
    }
  }
  
  // Bonus for longer, more substantive content (up to 10 points)
  score += Math.min(text.length / 100, 10);
  
  // Bonus for financial keywords that often accompany important statements (5 points each)
  const financialKeywords = ['revenue', 'profit', 'growth', 'margin', 'outlook', 'guidance', 'strategy', 'investment', 'quarter', 'year'];
  for (const keyword of financialKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      score += 5;
    }
  }
  
  return score;
}

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
    const reasoningTrace: any[] = [];
    let toolStepCounter = 0;
    const maxSteps = 12; // Prevent infinite loops
    
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

TOOL SELECTION GUIDE:
- Single company, latest earnings call: resolveSymbol → listTranscriptDates → getTranscript
- Financial statements/metrics: resolveSymbol → getStatement
- Growth analysis: resolveSymbol → getFinancialGrowth
- Multi-call analysis or topic search: resolveSymbol → searchTranscripts
- Cross-company comparisons: resolveSymbol (multiple) → searchTranscripts

USE searchTranscripts when the user asks about:
- "What has [company] management said about [topic] over recent calls?"
- "What are [executive1] and [executive2]'s comments about [topic]?"
- "How many [specific thing] did [company] mention in recent quarters?"
- Any query requiring searching across multiple earnings calls for specific topics

Examples:
- "What has Airbnb said about profitability?" → searchTranscripts(symbols=["ABNB"], topic="profitability")
- "Zuckerberg and Nadella's AI comments" → searchTranscripts(symbols=["META","MSFT"], topic="AI", executives=["Zuckerberg","Nadella"])
- "ServiceNow large deals last quarter" → searchTranscripts(symbols=["NOW"], topic="large deals", lookbackQuarters=1)

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
        if (toolStepCounter > 0) { // Only add completion step if we actually executed tools
          reasoningTrace.push({
            step: toolStepCounter + 1,
            type: 'completion',
            timestamp: new Date().toISOString(),
            message: 'Agent finished - no more tools needed'
          });
        }
        break;
      }

      // Process ALL tool calls (OpenAI can return multiple at once)
      const toolResponses = [];
      
      for (const toolCall of plannerDecision.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🚀 Step ${step + 1}: Executing '${toolName}' with args:`, toolArgs);
        allToolsUsed.push(toolName);
        toolStepCounter++; // Only increment when we actually execute a tool

        // Add to reasoning trace - combine execution and result in one step
        const toolStep = {
          step: toolStepCounter,
          type: 'tool_step',
          timestamp: new Date().toISOString(),
          toolName: toolName,
          toolArgs: toolArgs,
          result: null as any // Will be filled after execution
        };

        reasoningTrace.push(toolStep);

        // =================================================================
        // TOOL EXECUTOR - Execute the chosen tool
        // =================================================================
        let toolResult: unknown;
        let sourceUrl: string = "";

        switch (toolName) {
          case "resolveSymbol":
            sourceUrl = `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(toolArgs.query)}&limit=10&apikey=${PUBLIC_API_KEY}`;
            toolResult = await fmpClient.get("/search-name", { 
              query: toolArgs.query,
              limit: "10"
            });
            break;

          case "listTranscriptDates":
            sourceUrl = `https://financialmodelingprep.com/stable/earning-call-transcript-dates?symbol=${toolArgs.symbol}&apikey=${PUBLIC_API_KEY}`;
            toolResult = await fmpClient.get("/earning-call-transcript-dates", { 
              symbol: toolArgs.symbol 
            });
            break;

          case "getTranscript":
            sourceUrl = `https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${toolArgs.symbol}&year=${toolArgs.year}&quarter=${toolArgs.quarter}&apikey=${PUBLIC_API_KEY}`;
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
            sourceUrl = `https://financialmodelingprep.com/stable${statementEndpoint}?symbol=${toolArgs.symbol}&period=${period}&limit=${limit}&apikey=${PUBLIC_API_KEY}`;
            toolResult = await fmpClient.get(statementEndpoint, {
              symbol: toolArgs.symbol,
              period: period,
              limit: limit.toString()
            });
            break;

          case "getFinancialGrowth":
            const growthLimit = (Math.max(...(toolArgs.years || [10])) + 1).toString();
            sourceUrl = `https://financialmodelingprep.com/stable/financial-growth?symbol=${toolArgs.symbol}&period=${toolArgs.period || 'annual'}&limit=${growthLimit}&apikey=${PUBLIC_API_KEY}`;
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
            sourceUrl = `https://financialmodelingprep.com/stable/key-metrics?symbol=${toolArgs.symbol}&period=annual&limit=${metricsLimit}&apikey=${PUBLIC_API_KEY}`;
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
            sourceUrl = `https://financialmodelingprep.com/stable/news/stock?symbols=${symbolsString}&limit=${newsLimit}&apikey=${PUBLIC_API_KEY}`;
            toolResult = await fmpClient.get("/news/stock", {
              symbols: symbolsString,
              limit: newsLimit.toString()
            });
            break;

          case "getQuote":
            sourceUrl = `https://financialmodelingprep.com/stable/quote?symbol=${toolArgs.symbol}&apikey=${PUBLIC_API_KEY}`;
            toolResult = await fmpClient.get("/quote", { 
              symbol: toolArgs.symbol 
            });
            break;

          case "searchTranscripts":
            console.log("🔍 Executing complex searchTranscripts logic");
            
            // Extract parameters
            const symbols = Array.isArray(toolArgs.symbols) ? toolArgs.symbols : [toolArgs.symbols];
            const topic = toolArgs.topic || "";
            const executives = toolArgs.executives || [];
            const lookbackQuarters = toolArgs.lookbackQuarters || 4;
            
            sourceUrl = `Multi-transcript search across ${symbols.join(', ')} for "${topic}"`;
            
            try {
              const searchResults = [];
              
              // For each symbol, get recent transcripts and search them
              for (const symbol of symbols) {
                console.log(`🔍 Searching transcripts for ${symbol}`);
                
                // Get available transcript dates
                const transcriptDatesResult = await fmpClient.get("/earning-call-transcript-dates", { 
                  symbol: symbol 
                });
                
                if (!Array.isArray(transcriptDatesResult) || transcriptDatesResult.length === 0) {
                  console.log(`⚠️ No transcript dates found for ${symbol}`);
                  continue;
                }
                
                // Get the most recent quarters (up to lookbackQuarters) - FIXED: removed broken filter
                const recentDates = transcriptDatesResult.slice(0, lookbackQuarters);
                
                console.log(`📅 Found ${recentDates.length} recent quarters for ${symbol}`);
                
                // Fetch and search each transcript
                for (const dateInfo of recentDates) {
                  try {
                    console.log(`📄 Fetching ${symbol} transcript for:`, dateInfo);
                    
                    const transcriptResult = await fmpClient.get("/earning-call-transcript", {
                      symbol: symbol,
                      year: (dateInfo.fiscalYear || dateInfo.year).toString(),
                      quarter: dateInfo.quarter.toString()
                    });
                    
                    if (Array.isArray(transcriptResult) && transcriptResult.length > 0) {
                      const transcript = transcriptResult[0];
                      const content = transcript.content || "";
                      
                      // Search for topic mentions in the transcript
                      const topicMentions = searchTranscriptContent(content, topic, executives, symbol, dateInfo);
                      
                      if (topicMentions.length > 0) {
                        searchResults.push({
                          symbol: symbol,
                          year: dateInfo.year,
                          quarter: dateInfo.quarter,
                          date: transcript.date,
                          mentions: topicMentions
                        });
                      }
                    }
                  } catch (transcriptError) {
                    console.log(`⚠️ Error fetching transcript for ${symbol}:`, transcriptError);
                  }
                }
              }
              
              toolResult = {
                query: {
                  symbols: symbols,
                  topic: topic,
                  executives: executives,
                  lookbackQuarters: lookbackQuarters
                },
                results: searchResults,
                totalMatches: searchResults.reduce((sum, result) => sum + result.mentions.length, 0),
                companiesSearched: symbols.length,
                transcriptsAnalyzed: searchResults.length
              };
              
            } catch (error) {
              console.error("❌ Error in searchTranscripts:", error);
              toolResult = {
                error: `Failed to search transcripts: ${error instanceof Error ? error.message : 'Unknown error'}`,
                query: { symbols, topic, executives, lookbackQuarters }
              };
            }
            break;

          default:
            console.error(`❌ Unknown tool called: ${toolName}`);
            sourceUrl = "Unknown tool";
            toolResult = { error: `Unknown tool: ${toolName}` };
        }

        console.log(`✅ Tool result preview:`, 
          typeof toolResult === 'object' && toolResult !== null 
            ? Object.keys(toolResult).length > 0 
              ? `Object with keys: ${Object.keys(toolResult).join(', ')}` 
              : 'Empty object'
            : toolResult
        );

        // Add to reasoning trace
        const currentStep = reasoningTrace[reasoningTrace.length - 1];
        if (currentStep && currentStep.step === toolStepCounter) {
          // Update the current step with the result
          currentStep.result = {
            success: !toolResult || (typeof toolResult === 'object' && !toolResult.error),
            preview: typeof toolResult === 'object' && toolResult !== null 
              ? `Object with ${Object.keys(toolResult).length} keys`
              : String(toolResult).substring(0, 100)
          };
        }

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
            
          case "searchTranscripts":
            if (typeof toolResult === 'object' && toolResult !== null && !toolResult.error) {
              const result = toolResult as any;
              processedToolResult = {
                query: result.query,
                results: result.results,
                totalMatches: result.totalMatches,
                companiesSearched: result.companiesSearched,
                transcriptsAnalyzed: result.transcriptsAnalyzed,
                sourceUrl: sourceUrl,
                toolDescription: "Multi-Transcript Search",
                summary: `Found ${result.totalMatches} mentions of "${result.query.topic}" across ${result.transcriptsAnalyzed} transcripts from ${result.companiesSearched} companies`
              };
            } else {
              processedToolResult = {
                error: typeof toolResult === 'object' && toolResult !== null ? toolResult.error : 'Unknown error',
                sourceUrl: sourceUrl,
                toolDescription: "Multi-Transcript Search"
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
            break;
        }

        // Store the tool response for later addition to conversation
        toolResponses.push({
          tool_call_id: toolCall.id,
          role: "tool" as const,
          content: JSON.stringify(processedToolResult, null, 2),
        });

        console.log(`📝 Processed tool: ${toolName}`);
      }

      // Add the assistant message with ALL tool calls
      conversationHistory.push({
        ...plannerDecision,
        role: "assistant" as const,
      });

      // Add ALL tool responses
      for (const toolResponse of toolResponses) {
        conversationHistory.push(toolResponse);
      }

      console.log(`📝 Added all tool results to conversation history`);
    }

    console.log(`🎯 Agent execution complete. Used tools: ${allToolsUsed.join(' → ')}`);

    // =================================================================
    // SYNTHESIZER: Create streaming response from conversation history
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
- For EVERY tool used, you must cite it using the toolDescription and sourceUrl from the tool results
- Use this EXACT citation format for EVERY citation: [[toolDescription](sourceUrl)]
- NEVER use single brackets [text](url) - ALWAYS use double brackets [[text](url)]
- If data is missing or has errors, explain that clearly
- Don't make up information not in the provided data
- Format financial numbers clearly (e.g., $5.8B, 15.2%)

CITATION REQUIREMENTS:
- If you used resolveSymbol: [[Company Search](sourceUrl)]
- If you used getStatement: [[Income Statement API](sourceUrl)] or [[Balance Sheet API](sourceUrl)]
- If you used getTranscript: [[getTranscript](sourceUrl)]
- If you used listTranscriptDates: [[listTranscriptDates](sourceUrl)]
- If you used getFinancialGrowth: [[getFinancialGrowth](sourceUrl)]
- ALWAYS double brackets [[]] - never single brackets []

The original question was: "${userMessage.content}"`
        },
        ...conversationHistory
      ],
      temperature: 0.1,
      stream: true,
    });

    // Create streaming response using Server-Sent Events
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        // First, send the metadata (reasoning, tools used, etc.)
        const metadata = {
          type: 'metadata',
          toolsUsed: allToolsUsed,
          stepCount: allToolsUsed.length,
          reasoning: reasoningTrace
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`));

        // Then stream the actual content
        try {
          for await (const chunk of synthesizerResponse) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              const contentChunk = {
                type: 'content',
                content: content
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));
            }
          }
          
          // Send completion signal
          const completion = { type: 'done' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completion)}\n\n`));
          
        } catch (error) {
          console.error("Streaming error:", error);
          const errorChunk = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
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