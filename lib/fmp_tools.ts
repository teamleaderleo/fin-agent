/*
 * fmp_tools.ts — The canonical tool directory for our AI agent
 * -------------------------------------------------------------------
 */

export const fmpFunctions = [
  /** 1️⃣  Resolve company/asset name → ticker */
  {
    name: "resolveSymbol",
    description: "Converts a company's common name (e.g. 'Spotify') into its primary stock ticker symbol (e.g. 'SPOT'). First step for almost every query.",
    endpoint: "/search-symbol?query={query}&limit=1",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company name, e.g. 'Spotify' or 'CrowdStrike'" },
      },
      required: ["query"],
    },
    example_input: { query: "Spotify" },
  },

  /** 2️⃣  Enumerate available earnings-call transcript dates */
  {
    name: "listTranscriptDates",
    description: "Lists fiscal years & quarters for which earnings-call transcripts are available for the given ticker.",
    endpoint: "/earning-call-transcript-dates?symbol={symbol}",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol, e.g. 'ABNB'" },
      },
      required: ["symbol"],
    },
    example_input: { symbol: "ABNB" },
  },

  /** 3️⃣  Fetch a single earnings-call transcript */
  {
    name: "getTranscript",
    description: "Downloads the full text of a single earnings-call transcript for summarization.",
    endpoint: "/earning-call-transcript?symbol={symbol}&year={year}&quarter={quarter}",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        year: { type: "integer", minimum: 2000, maximum: 2030 },
        quarter: { type: "integer", minimum: 1, maximum: 4 },
      },
      required: ["symbol", "year", "quarter"],
    },
    example_input: { symbol: "MSFT", year: 2024, quarter: 1 },
  },

  /** 4️⃣  Search multiple recent transcripts for topic/exec quotes (MULTI-SYMBOL) */
  {
    name: "searchTranscripts",
    description: "Scans recent earnings-call transcripts for quotes matching a topic and (optionally) specific executive names. Can search multiple companies at once.",
    endpoint: "/earning-call-transcript // Executed internally across look-back window",
    method: "INTERNAL_MULTI_CALL",
    parameters: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          description: "One or more ticker symbols to scan, e.g. ['MSFT', 'META']",
          items: { type: "string" },
        },
        topic: { type: "string", description: "Keyword(s) to search for, like 'AI' or 'profitability'" },
        executives: {
          type: "array",
          description: "Optional list of executive last names to filter on",
          items: { type: "string" },
        },
        lookbackQuarters: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 8,
          description: "Number of recent quarters to scan for each symbol",
        },
      },
      required: ["symbols", "topic"],
    },
    example_input: {
      symbols: ["MSFT", "META"],
      topic: "AI",
      executives: ["Nadella", "Zuckerberg"],
      lookbackQuarters: 6,
    },
  },

  /** 5️⃣  Generic financial statement (income | balance | cash-flow) */
  {
    name: "getStatement",
    description: "Fetches annual or quarterly financial statements. Set 'statement' to 'income', 'balance-sheet', or 'cash-flow'.",
    endpoint: "/{statement}-statement?symbol={symbol}&period={period}&limit={limit}",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        statement: { type: "string", enum: ["income", "balance-sheet", "cash-flow"] },
        period: { type: "string", enum: ["annual", "quarter"], default: "annual" },
        limit: { type: "integer", minimum: 1, maximum: 40, default: 5 },
      },
      required: ["symbol", "statement"],
    },
    example_input: { symbol: "CRWD", statement: "income", period: "annual", limit: 10 },
  },

  /** 6️⃣  Smart financial growth with explicit metrics and years (FROM v3) */
  {
    name: "getFinancialGrowth",
    description: "Computes multi-year growth for specific financial metrics. Perfect for questions like 'CrowdStrike revenue growth over 3, 5, and 10 years'.",
    endpoint: "/financial-growth?symbol={symbol}&period=annual&limit={max_years}",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        metric: {
          type: "string",
          enum: ["revenue", "netIncome", "operatingCashFlow", "totalAssets"],
          description: "Which financial metric to calculate growth for"
        },
        years: {
          type: "array",
          items: { type: "integer" },
          description: "Explicit look-back periods (e.g. [3, 5, 10])",
          minItems: 1,
          maxItems: 5,
        },
        period: { type: "string", enum: ["annual", "quarter"], default: "annual" },
      },
      required: ["symbol", "metric", "years"],
    },
    example_input: { symbol: "CRWD", metric: "revenue", years: [3, 5, 10] },
  },

  /** 7️⃣  Key performance metrics & ratios */
  {
    name: "getKeyMetrics",
    description: "Returns Key Performance Indicators like P/E, margins, ROIC, etc. for the ticker (annual by default).",
    endpoint: "/key-metrics?symbol={symbol}&period=annual&limit={limit}",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 40, default: 5 },
      },
      required: ["symbol"],
    },
    example_input: { symbol: "AAPL", limit: 3 },
  },

  /** 8️⃣  News & press-release search for public comments */
  {
    name: "searchNews",
    description: "Searches recent news articles and press releases for one or more tickers. Best for finding public comments outside earnings calls.",
    endpoint: "/news/stock?symbols={symbols}&limit={limit}",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Array of ticker symbols, e.g. ['MSFT','META']",
        },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      required: ["symbols"],
    },
    example_input: { symbols: ["MSFT", "META"], limit: 15 },
  },

  /** 9️⃣  Spot quote (bonus for future use) */
  {
    name: "getQuote",
    description: "Fetches the latest real-time quote for a single ticker (price, change, volume).",
    endpoint: "/quote?symbol={symbol}",
    method: "GET",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
      },
      required: ["symbol"],
    },
    example_input: { symbol: "AAPL" },
  },
] as const;

// Metadata (from v3)
export const fmpToolsMetadata = {
  version: "1.0.0",
  designPrinciples: [
    "Small, composable toolset covering all assignment examples",
    "Generic getStatement prevents API bloat while staying explicit",
    "Smart getFinancialGrowth with explicit years array for direct answers",
    "Multi-symbol support for complex comparative queries",
    "Include example_input blocks to guide LLM planning",
  ],
  typicalQueryFlows: {
    transcriptSummary: ["resolveSymbol", "listTranscriptDates", "getTranscript"],
    financialMetric: ["resolveSymbol", "getStatement"],
    growthAnalysis: ["resolveSymbol", "getFinancialGrowth"],
    executiveCommentary: ["resolveSymbol", "searchTranscripts", "searchNews"],
  },
  assignmentCoverage: {
    "Summarize Spotify's latest conference call": ["resolveSymbol", "listTranscriptDates", "getTranscript"],
    "What has Airbnb management said about profitability": ["resolveSymbol", "searchTranscripts"],
    "Zuckerberg and Nadella comments about AI": ["resolveSymbol", "searchTranscripts", "searchNews"],
    "ServiceNow large deals last quarter": ["resolveSymbol", "getTranscript", "searchNews"],
    "CrowdStrike revenue 3/5/10 years + growth": ["resolveSymbol", "getFinancialGrowth"]
  }
};

export type FmpFunction = (typeof fmpFunctions)[number];