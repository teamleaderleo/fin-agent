'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolUsed?: string;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Focus input on mount and after each response
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    // Add user message immediately
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const data = await response.json();
      
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: data.reply,
        toolUsed: data.toolUsed 
      }]);

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: `❌ Error: ${errorMessage}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMessage = (content: string) => {
    // Handle markdown-style citations like [[toolName](url)]
    const withMarkdownLinks = content.replace(
      /\[\[([^\]]+)\]\(([^)]+)\)\]/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1 hover:bg-blue-200 transition-colors">$1 🔗</a>'
    );
    
    // Still handle old-style citations like [toolName] for backward compatibility (UH, we can remove this; we don't care about backwards compatibility)
    return withMarkdownLinks.replace(
      /\[([^\]]+)\]/g, 
      '<span class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1">$1</span>'
    );
  };

  const exampleQueries = [
    "What's Apple's ticker symbol?",
    "Show me Microsoft's latest income statement",
    "CrowdStrike revenue growth over 5 years",
    "Get Spotify's recent earnings transcript"
  ];

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">fin-agent</h1>
          <p className="text-sm text-gray-600 mt-1">Financial data at your fingertips</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Welcome message */}
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-8 border border-gray-200/50 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Welcome! Ask me about any company's financials.
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {exampleQueries.map((query, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(query)}
                      className="text-left p-3 bg-white/40 hover:bg-white/60 rounded-lg text-sm text-gray-700 transition-all duration-200 border border-gray-200/30 hover:border-gray-300/50"
                    >
                      "{query}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl rounded-2xl px-4 py-3 ${
                msg.role === 'user' 
                  ? 'bg-gray-800 text-white ml-12 shadow-sm' 
                  : 'bg-white/60 backdrop-blur-sm border border-gray-200/50 text-gray-800 mr-12 shadow-sm'
              }`}>
                <div 
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: msg.role === 'assistant' ? formatMessage(msg.content) : msg.content 
                  }}
                />
                {msg.toolUsed && (
                  <div className="text-xs text-gray-500 mt-2 font-mono">
                    🔧 Used: {msg.toolUsed}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-2xl px-4 py-3 mr-12">
                <div className="flex items-center space-x-2 text-gray-600">
                  <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full"></div>
                  <span className="text-sm">Analyzing your query...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white/80 backdrop-blur-sm border-t border-gray-200/50 px-6 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex space-x-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about any company's financials..."
              className="flex-1 px-4 py-3 bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-transparent outline-none text-gray-800 placeholder-gray-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-sm"
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}