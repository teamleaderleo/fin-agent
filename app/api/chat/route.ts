// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fmpFunctions } from "@/lib/fmp_tools";
import { openai } from "@/lib/openai_client";
import { fmpClient } from "@/lib/fmp_client";
import Fuse from 'fuse.js';
// Import the prompts from the new file
import { 
  PLANNER_SYSTEM_PROMPT, 
  SYNTHESIZER_SYSTEM_PROMPT_TEMPLATE, 
  TOPIC_EXPANSION_SYSTEM_PROMPT 
} from "./prompts";

const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY

// Helper function to search transcript content for topics and executives
function searchTranscriptContent(content: string, topics: string[], executives: string[], symbol: string, dateInfo: any) {
  interface TranscriptMention {
    topic: string; // The specific keyword that matched
    speaker: string;
    context: string;
    score: number;
  }

  const mentions: TranscriptMention[] = [];
  if (!content || topics.length === 0) return mentions;

  const paragraphs = content.split('\n')
    .filter(p => p.trim().length > 50)
    .map((text, index) => ({ text, index }));

  const fuse = new Fuse(paragraphs, {
    keys: ['text'],
    threshold: 0.3,
    includeScore: true,
    includeMatches: true, // We need this to know which topic matched
    minMatchCharLength: 3,
    ignoreLocation: true
  });

  // Create an $or query for Fuse.js to search for any of the topics
  const searchQuery = {
    $or: topics.map(topic => ({ text: topic }))
  };

  const results = fuse.search(searchQuery);
  console.log(`🔍 Fuzzy search for ${topics.length} keywords found ${results.length} potential matches in ${symbol}`);

  for (const result of results.slice(0, 15)) { // Increase limit slightly
    const paragraph = result.item.text;
    const paragraphIndex = result.item.index;
    const score = result.score || 0;
    
    // Determine which keyword was matched
    const matchedTopic = result.matches?.[0]?.value || topics[0];

    const contextStart = Math.max(0, paragraphIndex - 1);
    const contextEnd = Math.min(paragraphs.length - 1, paragraphIndex + 1);
    const context = paragraphs.slice(contextStart, contextEnd + 1).map(p => p.text).join('\n');

    let speaker = "Unknown";
    let executiveMatch = false;
    
    if (executives.length > 0) {
      const searchArea = paragraphs.slice(Math.max(0, paragraphIndex - 3), paragraphIndex + 1).map(p => p.text).join('\n');
      for (const exec of executives) {
        if (new RegExp(exec, 'i').test(searchArea)) {
          speaker = exec;
          executiveMatch = true;
          break;
        }
      }
      if (!executiveMatch) continue;
    } else {
      const speakerMatch = paragraph.match(/^([A-Z][a-zA-Z\s.,'-]+?)[:]/);
      if (speakerMatch && speakerMatch[1]) {
        speaker = speakerMatch[1].trim();
      }
    }

    mentions.push({
      topic: matchedTopic,
      speaker: speaker,
      context: context.substring(0, 800),
      score: score
    });
  }

  return mentions.sort((a, b) => a.score - b.score).slice(0, 8); // Return top 8 best matches overall
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
            content: PLANNER_SYSTEM_PROMPT
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
            
            const { symbols, topic, executives, lookbackQuarters } = {
              symbols: Array.isArray(toolArgs.symbols) ? toolArgs.symbols : [toolArgs.symbols],
              topic: toolArgs.topic || "",
              executives: toolArgs.executives || [],
              lookbackQuarters: toolArgs.lookbackQuarters || 4,
            };

            // --- Topic Expansion ---
            let expandedTopics = [topic];
            if (topic) {
              try {
                console.log(`🧠 Expanding search topic: "${topic}"`);
                const topicExpansionResponse = await openai.chat.completions.create({
                  model: "gpt-4.1-mini",
                  messages: [{
                    role: "system",
                    content: TOPIC_EXPANSION_SYSTEM_PROMPT
                  }, {
                    role: "user",
                    content: `Topic: "${topic}"`
                  }],
                  response_format: { type: "json_object" },
                  temperature: 0.2,
                });
                const expansionResult = JSON.parse(topicExpansionResponse.choices[0].message.content || '{}');
                if (expansionResult.topics && Array.isArray(expansionResult.topics)) {
                  expandedTopics = [...new Set([topic, ...expansionResult.topics])];
                  console.log(`✅ Expanded topics to: [${expandedTopics.join(', ')}]`);
                }
              } catch (expansionError) {
                console.error("⚠️ Failed to expand topic, continuing with original:", expansionError);
              }
            }
            
            sourceUrl = symbols.length === 1 
              ? `https://financialmodelingprep.com/stable/earning-call-transcript-dates?symbol=${symbols[0]}&apikey=${PUBLIC_API_KEY}`
              : `https://financialmodelingprep.com/developer/docs/stable/earnings-transcript-list`;
            
            try {
              const allMentions: any[] = [];
              let transcriptsAnalyzedCount = 0;
              
              for (const symbol of symbols) {
                console.log(`🔍 Searching transcripts for ${symbol}`);
                const transcriptDatesResult = await fmpClient.get("/earning-call-transcript-dates", { symbol });
                if (!Array.isArray(transcriptDatesResult) || transcriptDatesResult.length === 0) continue;
                
                const recentDates = transcriptDatesResult.slice(0, lookbackQuarters);
                
                for (const dateInfo of recentDates) {
                  try {
                    const transcriptResult = await fmpClient.get("/earning-call-transcript", {
                      symbol,
                      year: (dateInfo.fiscalYear || dateInfo.year).toString(),
                      quarter: dateInfo.quarter.toString()
                    });
                    
                    if (Array.isArray(transcriptResult) && transcriptResult.length > 0) {
                      transcriptsAnalyzedCount++;
                      const content = transcriptResult[0].content || "";
                      const topicMentions = searchTranscriptContent(content, expandedTopics, executives, symbol, dateInfo);
                      
                      if (topicMentions.length > 0) {
                        topicMentions.forEach(mention => {
                          allMentions.push({
                            ...mention,
                            symbol: symbol,
                            date: transcriptResult[0].date,
                          });
                        });
                      }
                    }
                  } catch (transcriptError) {
                     console.log(`⚠️ Error fetching transcript for ${symbol} Q${dateInfo.quarter} ${dateInfo.year}:`, transcriptError);
                  }
                }
              }

              // =================================================================
              // ✨ AGGRESSIVE SUMMARIZATION LOGIC ✨
              // =================================================================
              console.log(`📊 Found ${allMentions.length} total potential mentions. Summarizing...`);
              allMentions.sort((a, b) => a.score - b.score);

              // Stricter limits to guarantee staying under the token limit
              const MAX_MENTIONS_TO_RETURN = 15;
              const SNIPPET_LENGTH = 200;

              const summarizedMentions = allMentions.slice(0, MAX_MENTIONS_TO_RETURN).map(mention => ({
                symbol: mention.symbol,
                date: mention.date,
                speaker: mention.speaker,
                topic: mention.topic,
                snippet: mention.context.substring(0, SNIPPET_LENGTH) + '...'
              }));
              
              console.log(`✅ Summarized to the top ${summarizedMentions.length} snippets.`);
              
              // This final, smaller object becomes the toolResult
              toolResult = {
                query: { symbols, topic, executives, lookbackQuarters },
                resultsSummary: summarizedMentions,
                totalMatchesFound: allMentions.length,
                companiesSearched: symbols.length,
                transcriptsAnalyzed: transcriptsAnalyzedCount,
                summary: `Found ${allMentions.length} potential mentions of "${topic}". Returning the top ${summarizedMentions.length} most relevant snippets.`
              };
              
            } catch (error) {
              console.error("❌ Error in searchTranscripts:", error);
              toolResult = { error: `Failed to search transcripts: ${error instanceof Error ? error.message : 'Unknown error'}`, query: { symbols, topic, executives, lookbackQuarters }};
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
            // The result is already processed and summarized, just pass it through.
            if (typeof toolResult === 'object' && toolResult !== null && !toolResult.error) {
              processedToolResult = {
                ...toolResult,
                sourceUrl: sourceUrl,
                toolDescription: "Multi-Transcript Search"
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

    // Dynamically insert the user's question into the synthesizer prompt
    const synthesizerPrompt = SYNTHESIZER_SYSTEM_PROMPT_TEMPLATE.replace(
      '{originalQuestion}', 
      userMessage.content
    );

    const synthesizerResponse = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: synthesizerPrompt
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