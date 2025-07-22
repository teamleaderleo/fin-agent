// app/api/chat/tool-executor.ts
import { fmpClient } from "@/lib/fmp_client";
import { executeTranscriptSearch } from "./transcript-searcher";

const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY;

// Defines the shape of the data returned by the executor service
export interface ToolExecutionResult {
  toolResult: unknown;
  sourceUrl: string;
}

/**
 * Executes a single tool call based on its name and arguments.
 * This function is the "data fetching" layer.
 * @param toolName The name of the function to execute.
 * @param toolArgs The arguments for the function.
 * @returns A promise that resolves to the raw tool result and its source URL.
 */
export async function executeTool(toolName: string, toolArgs: any): Promise<ToolExecutionResult> {
  let toolResult: unknown;
  let sourceUrl: string = "No URL determined";

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
      const { statement, period = 'annual', limit = 5 } = toolArgs;
      const statementEndpoint = `/${statement}-statement`;
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
      // The metadata decoration now happens in the processor.
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
      const symbolsString = Array.isArray(toolArgs.symbols) ? toolArgs.symbols.join(',') : toolArgs.symbols;
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
      const symbolsForUrl = Array.isArray(toolArgs.symbols) ? toolArgs.symbols : [toolArgs.symbols];
      sourceUrl = symbolsForUrl.length === 1 
        ? `https://financialmodelingprep.com/stable/earning-call-transcript-dates?symbol=${symbolsForUrl[0]}&apikey=${PUBLIC_API_KEY}`
        : `https://financialmodelingprep.com/developer/docs/stable/earnings-transcript-list`;
      
      toolResult = await executeTranscriptSearch(toolArgs);
      break;

    default:
      console.error(`❌ Unknown tool called: ${toolName}`);
      sourceUrl = "Unknown tool";
      toolResult = { error: `Unknown tool: ${toolName}` };
  }

  return { toolResult, sourceUrl };
}