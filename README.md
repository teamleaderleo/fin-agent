# fin-agent 🤖

An intelligent financial research assistant powered by a multi-step AI agent built with Next.js and the OpenAI API. Ask complex financial questions, get detailed answers, and see the AI's reasoning every step of the way.

**Live Demo:** 

![fin-agent-showcase](https://user-images.githubusercontent.com/your-username/your-repo/assets/placeholder.gif)

## ✨ Core Features

*   **🧠 Agentic AI:** Unlike simple chatbots, fin-agent uses a multi-step "Planner" agent that can think, reason, and chain multiple tools together to answer complex queries.
*   **🔌 Comprehensive Financial Tools:** Access a wide range of real-time financial data through integrated tools:
    *   **Company Search:** Resolve company names to ticker symbols (`resolveSymbol`).
    *   **Stock Quotes:** Get the latest stock prices (`getQuote`).
    *   **Financial Statements:** Fetch income statements, balance sheets, and cash flow statements (`getStatement`).
    *   **Growth & Metrics:** Pull historical financial growth and key metrics (`getFinancialGrowth`, `getKeyMetrics`).
    *   **Earnings Transcripts:** Retrieve full earnings call transcripts by quarter and year (`getTranscript`).
*   **🔍 Advanced Multi-Transcript Analysis:** The `searchTranscripts` tool is a powerhouse. It can:
    *   Search for specific topics across multiple earnings calls for one or more companies.
    *   Filter comments by specific executives (e.g., "What has Satya Nadella said about AI?").
    *   Use AI-powered topic expansion to find related keywords and improve search recall.
    *   Intelligently summarize and rank the most relevant mentions.
*   **⚡ Streaming Responses:** Answers stream in token-by-token using Server-Sent Events (SSE) for a real-time, responsive user experience.
*   **🔬 Reasoning Transparency:** Every AI-powered response includes a "Reasoning" dropdown that shows the exact tools the agent used, the parameters it chose, and the results it got back, providing full transparency into the AI's thought process.
*   **💾 Persistent Chat History:** Conversations are automatically saved to `localStorage`, allowing you to manage multiple chats and pick up where you left off.
*   **😎 Modern UI/UX:** A clean, responsive interface with a dark mode toggle for comfortable viewing.

## 🚀 Technical Showcase & Architecture

This project was architected with a strong emphasis on **separation of concerns**, **maintainability**, and **modern development patterns**.

### Backend: The Agentic Core (`/app/api/chat`)

The backend is a single Next.js API Route that orchestrates the entire AI agentic workflow. It's designed to be modular and easy to extend.

1.  **Orchestrator (`route.ts`):** The main API endpoint that manages the agent's loop. It does not contain any business logic itself.
2.  **Planner Agent:** On each loop, a "Planner" LLM call (using GPT-4.1-mini) analyzes the conversation history and decides which tool to use next, if any.
3.  **Service Layer:**
    *   **Tool Executor (`tool.executor.ts`):** A dedicated service that handles the raw data fetching. It takes a tool name and arguments and calls the appropriate external API (e.g., Financial Modeling Prep).
    *   **Tool Processor (`tool.processor.ts`):** This service takes the raw JSON from the executor and transforms it into a clean, structured, and LLM-friendly format. This separates data fetching from data transformation.
    *   **Transcript Searcher (`transcript.searcher.ts`):** The most complex tool's logic is fully encapsulated in its own service, keeping the executor clean.
4.  **Synthesizer Agent:** After the tool loop is complete, a final "Synthesizer" LLM call is made with the full context (original question + all tool results) to generate the final, user-facing answer.
5.  **Streaming via SSE:** The final response is streamed back to the client using the `ReadableStream` API for a real-time feel.

### Frontend: A Modern, Hook-Based Approach (`/components`, `/hooks`)

The frontend was refactored from a single monolithic component into a scalable, component-based architecture powered by custom hooks.

1.  **State Management via Custom Hooks:** All complex state logic is abstracted into two primary hooks:
    *   **`useChatHistory()`:** Manages the global state of all conversations, including loading/saving to `localStorage` and handling the creation, deletion, and selection of chats.
    *   **`useChat()`:** Manages the state of the *active* conversation, including the message list, user input, loading state, and the API call lifecycle.
2.  **Component Hierarchy:**
    *   **`ChatInterface.tsx`:** The top-level "Orchestrator" component. It calls the hooks and passes state and handlers down to its children. It contains no complex logic itself.
    *   **Child Components (`/components/chat`):** The UI is broken down into small, single-responsibility components (`MessageList`, `ChatMessage`, `ChatInput`, `ReasoningDisplay`, etc.), making the codebase easy to navigate and maintain.
3.  **API Communication (`/services`):** The client-side `fetch` logic for the SSE stream is isolated in a dedicated service, separating it from component logic.

This architecture ensures the application is not only functional but also clean, testable, and easy to build upon.

## 🛠️ Tech Stack

*   **Framework:** Next.js 14 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **AI:** OpenAI API (GPT-4.1-mini)
*   **Financial Data:** Financial Modeling Prep (FMP) API
*   **Backend:** Next.js API Routes (Serverless Functions)
*   **Linting/Formatting:** ESLint & Prettier

## ⚙️ Getting Started

To run this project locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/fin-agent.git
    cd fin-agent
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up environment variables:**
    Create a file named `.env.local` in the root of the project and add your API keys:
    ```env
    # .env.local

    # Get from https://platform.openai.com/
    OPENAI_API_KEY="sk-..."

    # Get from https://site.financialmodelingprep.com/developer
    # This is the key for the backend API calls
    FMP_API_KEY="your_fmp_api_key"
    
    # This is the same key, but exposed to the client for building source URLs
    # In a production app, you might handle source URLs differently
    NEXT_PUBLIC_FMP_API_KEY="your_fmp_api_key"
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

5.  Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## 🔮 Future Improvements

While this is a fully functional application, here are a few ways it could be extended:

*   **Stream Reasoning:** Stream the reasoning steps to the UI in real-time as the agent executes them, giving the user instant feedback on the agent's progress.
*   **Enhanced Error Handling:** Display more user-friendly error messages on the frontend when an API call or tool execution fails.
*   **Unit & E2E Testing:** Implement unit tests with Jest and React Testing Library for hooks and components, and add end-to-end tests with Playwright or Cypress to ensure core user flows are never broken.
*   **More Advanced Tools:** Add new tools for more complex analysis, such as:
    *   A tool to calculate and compare financial ratios (P/E, Debt-to-Equity).
    *   A tool to generate charts or graphs using a library like Recharts.
*   **Token & Cost Management:** Implement a token counter to estimate the cost of each query and set limits to prevent expensive API calls.