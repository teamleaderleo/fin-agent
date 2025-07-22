// components/chat/WelcomeScreen.tsx

interface Props {
  setInput: (query: string) => void;
  isDarkMode: boolean;
}

const exampleQueries = [
  "What's Apple's ticker symbol?",
  "Show me Microsoft's latest income statement",
  "CrowdStrike revenue growth over 5 years",
  "Summarize Spotify's latest conference call",
  "What has Airbnb management said about profitability over the last few earnings calls?",
  "What are Mark Zuckerberg's and Satya Nadella's recent comments about AI?",
  "How many new large deals did ServiceNow sign in the last quarter?",
  "What was Crowdstrike's revenue in the past 3, 5, and 10 years?",
  "What was Crowdstrike's revenue growth in the past 3, 5, and 10 years?",
  "What has Tesla said about autonomous driving in recent calls?",
  "Compare Netflix and Disney's subscriber growth strategies",
  "What is Amazon's latest guidance on AWS growth?"
];

export function WelcomeScreen({ setInput, isDarkMode }: Props) {
  return (
    <div className="text-center py-12">
      <div className={`backdrop-blur-sm rounded-xl p-8 border shadow-sm transition-colors ${ isDarkMode ? 'bg-gray-800/60 border-gray-700/50' : 'bg-white/60 border-gray-200/50'}`}>
        <h2 className={`text-lg font-semibold mb-4 transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
          Welcome! Ask me about any company&#39;s financials.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {exampleQueries.map((query, idx) => (
            <button key={idx} onClick={() => setInput(query)} className={`text-left p-3 rounded-lg text-sm transition-all duration-200 border ${ isDarkMode ? 'bg-gray-700/40 hover:bg-gray-700/60 text-gray-200 border-gray-600/30 hover:border-gray-600/50' : 'bg-white/40 hover:bg-white/60 text-gray-700 border-gray-200/30 hover:border-gray-300/50'}`}>
              &quot;{query}&quot;
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}