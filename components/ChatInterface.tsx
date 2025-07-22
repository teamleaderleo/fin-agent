'use client';

import { useState, useRef, useEffect } from 'react';

// --- TYPE DEFINITIONS ---
interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolUsed?: string;
  reasoning?: any[];
  stepCount?: number;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// --- MAIN COMPONENT ---
export default function ChatInterface() {
  // --- STATE MANAGEMENT ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // State for multi-chat history
  const [chatHistory, setChatHistory] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  // State for UI feedback
  const [expandedReasoning, setExpandedReasoning] = useState<number | null>(null);
  const [copiedReasoning, setCopiedReasoning] = useState<number | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);

  // --- REFS ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- HELPER FUNCTIONS for Chat History ---

  const createNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setExpandedReasoning(null);
    inputRef.current?.focus();
  };

  const loadChat = (chatId: string) => {
    const chat = chatHistory.find((c) => c.id === chatId);
    if (chat) {
      setCurrentChatId(chat.id);
      setMessages(chat.messages);
    }
  };

  const deleteChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent loadChat from firing
    
    const updatedHistory = chatHistory.filter((c) => c.id !== chatId);
    setChatHistory(updatedHistory);
    
    // If the deleted chat was the currently active one, start a new chat
    if (currentChatId === chatId) {
      createNewChat();
    }
  };
  
  // --- EFFECTS ---

  // Scroll to bottom of messages on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when not loading
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);
  
  // Load chat history and dark mode from localStorage on initial mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('fin-agent-chat-history');
      if (savedHistory) {
        const parsedHistory: Chat[] = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
          setChatHistory(parsedHistory);
          // Load the most recently updated chat
          const latestChat = parsedHistory.reduce((a, b) => a.updatedAt > b.updatedAt ? a : b);
          loadChat(latestChat.id);
        }
      }
      
      const savedDarkMode = localStorage.getItem('fin-agent-dark-mode');
      setIsDarkMode(savedDarkMode === 'true');

    } catch (error) {
      console.error('Failed to load saved data:', error);
      // If history is corrupt, clear it to prevent crash loop
      localStorage.removeItem('fin-agent-chat-history');
    }
  }, []);

  // Save entire chat history to localStorage whenever it changes
  useEffect(() => {
    // A simple check to avoid saving the initial empty state
    if (chatHistory.length > 0) {
       try {
        localStorage.setItem('fin-agent-chat-history', JSON.stringify(chatHistory));
      } catch (error) {
        console.error('Failed to save chat history:', error);
      }
    } else if (currentChatId === null && messages.length === 0) {
        // Also allow clearing the storage if all chats are deleted
        localStorage.removeItem('fin-agent-chat-history');
    }
  }, [chatHistory]);

  // Auto-save messages to the current chat in history
  useEffect(() => {
    // Don't run on initial load or if messages are empty in a new chat
    if (messages.length === 0 && !currentChatId) return;

    const handler = setTimeout(() => {
      if (currentChatId) {
        // Update an existing chat
        setChatHistory(prev =>
          prev.map(chat =>
            chat.id === currentChatId
              ? { ...chat, messages, updatedAt: Date.now() }
              : chat
          )
        );
      } else if (messages.length > 0) {
        // Create a new chat
        const newChat: Chat = {
          id: String(Date.now()),
          title: messages[0].content.substring(0, 40) + (messages[0].content.length > 40 ? '...' : ''),
          messages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setCurrentChatId(newChat.id);
        setChatHistory(prev => [newChat, ...prev]);
      }
    }, 500); // Debounce saving to avoid excessive writes during streaming

    return () => clearTimeout(handler);
  }, [messages, currentChatId]); // Depend on messages and currentChatId


  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('fin-agent-dark-mode', String(newDarkMode));
  };
  
  // --- COPY FUNCTIONS ---
  const copyReasoning = async (messageIdx: number, reasoning: any[]) => {
    try {
      const reasoningText = reasoning.map((step) => {
        let text = `${step.step}. `;
        if (step.type === 'tool_step') {
          text += `🚀 ${step.toolName}\n`;
          if (step.toolArgs) text += `${JSON.stringify(step.toolArgs, null, 2)}\n`;
          if (step.result) text += `→ ${step.result.preview}\n`;
        } else if (step.type === 'completion') {
          text += `🏁 Finished\n`;
          if (step.message) text += `${step.message}\n`;
        }
        return text;
      }).join('\n');

      await navigator.clipboard.writeText(reasoningText);
      setCopiedReasoning(messageIdx);
      setTimeout(() => setCopiedReasoning(null), 2000);
    } catch (err) {
      console.error('Failed to copy reasoning:', err);
    }
  };

  const copyMessage = async (messageIdx: number, content: string) => {
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';
      
      await navigator.clipboard.writeText(plainText);
      setCopiedMessage(messageIdx);
      setTimeout(() => setCopiedMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };
  
  // --- FORM SUBMISSION ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessageContent = input.trim();
    const newUserMessage: Message = { role: 'user', content: userMessageContent };
    
    const newMessages = [...messages, newUserMessage];
    setMessages(newMessages);
    setInput('');
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
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body reader');

      const decoder = new TextDecoder();
      const assistantMessage: Message = { role: 'assistant', content: '' };
      setMessages(prev => [...prev, assistantMessage]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              setMessages(prev => {
                const lastMsgIndex = prev.length - 1;
                let updatedLastMsg = { ...prev[lastMsgIndex] };

                if (data.type === 'metadata') {
                  updatedLastMsg = { ...updatedLastMsg, ...data };
                  setIsLoading(false);
                } else if (data.type === 'content') {
                  updatedLastMsg.content += data.content;
                }
                
                const newMsgs = [...prev];
                newMsgs[lastMsgIndex] = updatedLastMsg;
                return newMsgs;
              });

              if (data.type === 'done') {
                console.log('✅ Streaming complete');
                setIsLoading(false); // Ensure loading is false on done
                break;
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }

            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${errorMessage}` }]);
    } finally {
        setIsLoading(false);
    }
  };

  const formatMessage = (content: string) => {
    let formatted = content.replace(
      /\[\[([^\]]+)\]\(([^)]+)\)\]/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1 hover:bg-blue-200 transition-colors">$1 🔗</a>'
    );
    formatted = formatted.replace(
      /\*\*([^*]+)\*\*\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1 hover:bg-blue-200 transition-colors">$1 🔗</a>'
    );
    return formatted.replace(
      /\[([^\]]+)\]/g, 
      '<span class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1">$1</span>'
    );
  };
  
  const exampleQueries = [
    "What's Apple's ticker symbol?",
    "Show me Microsoft's latest income statement",
    "CrowdStrike revenue growth over 5 years",
    "Get Spotify's recent earnings transcript",
    "What has Airbnb management said about profitability over the last few earnings calls?",
    "What are Mark Zuckerberg's and Satya Nadella's recent comments about AI?",
    "How many new large deals did ServiceNow sign in the last quarter?",
    "What has Tesla said about autonomous driving in recent calls?",
    "Compare Netflix and Disney's subscriber growth strategies",
    "What is Amazon's latest guidance on AWS growth?"
  ];

  // --- RENDER ---
  return (
    <div className={`flex h-screen transition-colors ${ isDarkMode ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-gray-50 to-gray-100'}`}>
      
      {/* Chat History Sidebar */}
      <div className={`${showHistory ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden border-r ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200/50'}`}>
        <div className={`w-80 h-full backdrop-blur-sm ${isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'}`}>
          <div className="p-4 border-b border-gray-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className={`font-semibold transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Chat History</h2>
              <button onClick={() => setShowHistory(false)} className={`p-1 rounded transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>✕</button>
            </div>
            <button onClick={createNewChat} className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${ isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white'}`}>
              + New Chat
            </button>
          </div>
          
          <div className="p-2 overflow-y-auto h-[calc(100%-5rem)]">
            {chatHistory
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((chat) => (
                <div key={chat.id} onClick={() => loadChat(chat.id)} className={`group p-3 rounded-lg cursor-pointer transition-all duration-200 mb-2 ${
                    chat.id === currentChatId ? (isDarkMode ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200')
                    : (isDarkMode ? 'hover:bg-gray-800/60 border border-transparent' : 'hover:bg-gray-100/60 border border-transparent')
                  }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate transition-colors ${ chat.id === currentChatId ? (isDarkMode ? 'text-blue-200' : 'text-blue-700') : (isDarkMode ? 'text-gray-200' : 'text-gray-700')}`}>
                        {chat.title}
                      </p>
                      <p className={`text-xs mt-1 transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        {new Date(chat.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button onClick={(e) => deleteChat(chat.id, e)} className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${ isDarkMode ? 'text-gray-500 hover:text-red-400 hover:bg-red-400/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-100' }`}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className={`backdrop-blur-sm border-b px-6 py-4 transition-colors ${isDarkMode ? 'bg-gray-900/80 border-gray-700/50' : 'bg-white/80 border-gray-200/50'}`}>
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowHistory(!showHistory)} className={`p-2 rounded-lg transition-colors ${ isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700' }`} title="Toggle chat history">
                📂
              </button>
              <div>
                <h1 className={`text-2xl font-bold transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>fin-agent</h1>
                <p className={`text-sm mt-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Financial data at your fingertips</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={toggleDarkMode} className={`p-2 rounded-lg transition-colors ${ isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                {isDarkMode ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {messages.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <div className={`backdrop-blur-sm rounded-xl p-8 border shadow-sm transition-colors ${ isDarkMode ? 'bg-gray-800/60 border-gray-700/50' : 'bg-white/60 border-gray-200/50'}`}>
                  <h2 className={`text-lg font-semibold mb-4 transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                    Welcome! Ask me about any company's financials.
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {exampleQueries.map((query, idx) => (
                      <button key={idx} onClick={() => setInput(query)} className={`text-left p-3 rounded-lg text-sm transition-all duration-200 border ${ isDarkMode ? 'bg-gray-700/40 hover:bg-gray-700/60 text-gray-200 border-gray-600/30 hover:border-gray-600/50' : 'bg-white/40 hover:bg-white/60 text-gray-700 border-gray-200/30 hover:border-gray-300/50'}`}>
                        "{query}"
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl ${msg.role === 'user' ? 'ml-12' : 'mr-12'} space-y-2`}>
                  
                  {msg.role === 'assistant' && msg.reasoning && msg.reasoning.length > 0 && (
                    <div className={`backdrop-blur-sm border rounded-lg overflow-hidden transition-colors ${ isDarkMode ? 'bg-gray-800/40 border-gray-700/50' : 'bg-white/40 border-gray-200/50'}`}>
                      <div className={`px-3 py-2 hover:bg-opacity-60 transition-all duration-200 ${ isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-white/60'}`}>
                        <div className={`flex items-center justify-between text-sm transition-colors ${ isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          <div onClick={() => setExpandedReasoning(expandedReasoning === idx ? null : idx)} className="flex items-center gap-2 cursor-pointer select-none flex-1">
                            <span className="text-xs">🧠</span>
                            <span>Used {msg.stepCount} reasoning steps</span>
                            <span className={`text-xs transition-colors ${ isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Click to expand</span>
                            <span className={`transform transition-transform ${ isDarkMode ? 'text-gray-500' : 'text-gray-400'} ${expandedReasoning === idx ? 'rotate-180' : ''}`}>▼</span>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); copyReasoning(idx, msg.reasoning!);}} className={`ml-2 px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${ isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700' }`}>
                            {copiedReasoning === idx ? (<>✓ Copied</>) : (<>📋 Copy</>)}
                          </button>
                        </div>
                      </div>
                      
                      {expandedReasoning === idx && (
                        <div className={`px-3 pb-3 pt-0 border-t space-y-3 select-text transition-colors ${ isDarkMode ? 'border-gray-700/50' : 'border-gray-200/50'}`}>
                          {msg.reasoning.map((step, stepIdx) => (
                            <div key={stepIdx} className="text-xs">
                              <div className="flex items-start gap-2 mb-1">
                                <span className={`font-mono mt-0.5 select-none transition-colors ${ isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{step.step}.</span>
                                <div className="flex-1">
                                  <div className={`font-medium flex items-center gap-1 transition-colors ${ isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                                    {step.type === 'tool_step' && `🚀 ${step.toolName}`}
                                    {step.type === 'completion' && '🏁 Finished'}
                                  </div>
                                  {step.toolArgs && ( <div className={`mt-0.5 font-mono text-xs transition-colors ${ isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{JSON.stringify(step.toolArgs, null, 2)}</div>)}
                                  {step.result && (<div className={`mt-0.5 transition-colors ${ isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>→ {step.result.preview}</div>)}
                                  {step.message && step.type === 'completion' && (<div className={`mt-0.5 italic transition-colors ${ isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{step.message}</div>)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`rounded-2xl px-4 py-3 relative shadow-sm transition-colors ${ msg.role === 'user' ? (isDarkMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white') : (isDarkMode ? 'bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 text-gray-100' : 'bg-white/60 backdrop-blur-sm border border-gray-200/50 text-gray-800')}`}>
                    <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: msg.role === 'assistant' ? formatMessage(msg.content) : msg.content }} />
                    {msg.toolUsed && (<div className={`text-xs mt-2 font-mono transition-colors ${ isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>🔧 Used: {msg.toolUsed}</div>)}
                    
                    {msg.role === 'assistant' && msg.content && (
                      <button onClick={() => copyMessage(idx, msg.content)} className={`absolute bottom-2 right-2 p-1 text-xs rounded transition-colors shadow-sm opacity-60 hover:opacity-100 ${ isDarkMode ? 'bg-gray-700/80 hover:bg-gray-700 text-gray-300' : 'bg-white/80 hover:bg-white text-gray-700'}`} title="Copy message">
                        {copiedMessage === idx ? '✓' : '📋'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                 <div className={`rounded-2xl px-4 py-3 mr-12 backdrop-blur-sm border transition-colors ${isDarkMode ? 'bg-gray-800/60 border-gray-700/50' : 'bg-white/60 border-gray-200/50'}`}>
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full" style={{borderColor: isDarkMode ? 'rgba(209, 213, 219, 0.5)' : 'rgba(107, 114, 128, 0.5)', borderTopColor: 'transparent'}}></div>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Form */}
        <div className={`backdrop-blur-sm border-t px-6 py-4 transition-colors ${ isDarkMode ? 'bg-gray-900/80 border-gray-700/50' : 'bg-white/80 border-gray-200/50'}`}>
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="flex space-x-3">
              <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about any company's financials..." className={`flex-1 px-4 py-3 backdrop-blur-sm border rounded-xl focus:ring-2 focus:border-transparent outline-none transition-colors ${ isDarkMode ? 'bg-gray-800/60 border-gray-700/50 text-gray-100 placeholder-gray-400 focus:ring-blue-500' : 'bg-white/60 border-gray-200/50 text-gray-800 placeholder-gray-500 focus:ring-gray-400'}`} disabled={isLoading}/>
              <button type="submit" disabled={!input.trim() || isLoading} className={`px-6 py-3 rounded-xl font-medium shadow-sm transition-all duration-200 ${!input.trim() || isLoading ? (isDarkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed') : (isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-800 text-white hover:bg-gray-700')}`}>
                {isLoading ? '...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}