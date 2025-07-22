'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolUsed?: string;
  reasoning?: any[];
  stepCount?: number;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<number | null>(null);
  const [copiedReasoning, setCopiedReasoning] = useState<number | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
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

  const copyReasoning = async (messageIdx: number, reasoning: any[]) => {
    try {
      const reasoningText = reasoning.map((step, idx) => {
        let text = `${step.step}. `;
        if (step.type === 'tool_step') {
          text += `🚀 ${step.toolName}\n`;
          if (step.toolArgs) {
            text += `${JSON.stringify(step.toolArgs, null, 2)}\n`;
          }
          if (step.result) {
            text += `→ ${step.result.preview}\n`;
          }
        } else if (step.type === 'completion') {
          text += `🏁 Finished\n`;
          if (step.message) {
            text += `${step.message}\n`;
          }
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
      // Strip HTML tags for plain text copy
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

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No reader available');
      }

      // Initialize the assistant message
      let assistantMessage: Message = {
        role: 'assistant',
        content: '',
      };

      // Add empty assistant message that will be updated
      setMessages([...newMessages, assistantMessage]);

      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'metadata') {
                // Update assistant message with metadata and stop loading
                assistantMessage = {
                  ...assistantMessage,
                  toolUsed: data.toolsUsed?.join(' → '),
                  reasoning: data.reasoning,
                  stepCount: data.stepCount
                };
                
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  assistantMessage
                ]);
                
                // Stop loading once we start receiving content
                setIsLoading(false);
              } else if (data.type === 'content') {
                // Append content to the assistant message
                assistantMessage = {
                  ...assistantMessage,
                  content: assistantMessage.content + data.content
                };
                
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  assistantMessage
                ]);
              } else if (data.type === 'done') {
                console.log('✅ Streaming complete');
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
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: `❌ Error: ${errorMessage}` 
      }]);
      setIsLoading(false);
    }
  };

  const formatMessage = (content: string) => {
    // Handle double bracket citations like [[Tool Name](url)]
    let formatted = content.replace(
      /\[\[([^\]]+)\]\(([^)]+)\)\]/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1 hover:bg-blue-200 transition-colors">$1 🔗</a>'
    );
    
    // Handle broken format like **Tool Name**(url) that LLM sometimes outputs
    formatted = formatted.replace(
      /\*\*([^*]+)\*\*\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1 hover:bg-blue-200 transition-colors">$1 🔗</a>'
    );
    
    // Handle old-style citations like [toolName] for backward compatibility
    return formatted.replace(
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
              <div className={`max-w-2xl ${msg.role === 'user' ? 'ml-12' : 'mr-12'} space-y-2`}>
                
                {/* Reasoning Bar (top of assistant messages, like Claude) */}
                {msg.role === 'assistant' && msg.reasoning && msg.reasoning.length > 0 && (
                  <div className="bg-white/40 backdrop-blur-sm border border-gray-200/50 rounded-lg overflow-hidden">
                    {/* Clickable Header */}
                    <div className="px-3 py-2 hover:bg-white/60 transition-all duration-200">
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <div 
                          onClick={() => setExpandedReasoning(expandedReasoning === idx ? null : idx)}
                          className="flex items-center gap-2 cursor-pointer select-none flex-1"
                        >
                          <span className="text-xs">🧠</span>
                          <span>Used {msg.stepCount} reasoning steps</span>
                          <span className="text-xs text-gray-400">Click to expand</span>
                          <span className={`transform transition-transform text-gray-400 ${expandedReasoning === idx ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyReasoning(idx, msg.reasoning!);
                          }}
                          className="ml-2 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors flex items-center gap-1"
                        >
                          {copiedReasoning === idx ? (
                            <>✓ Copied</>
                          ) : (
                            <>📋 Copy</>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {/* Expandable Content - NOT clickable, text is selectable */}
                    {expandedReasoning === idx && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-200/50 space-y-3 select-text">
                        {msg.reasoning.map((step, stepIdx) => (
                          <div key={stepIdx} className="text-xs">
                            <div className="flex items-start gap-2 mb-1">
                              <span className="text-gray-400 font-mono mt-0.5 select-none">
                                {step.step}.
                              </span>
                              <div className="flex-1">
                                <div className="font-medium text-gray-700 flex items-center gap-1">
                                  {step.type === 'tool_step' && `🚀 ${step.toolName}`}
                                  {step.type === 'completion' && '🏁 Finished'}
                                </div>
                                {step.toolArgs && (
                                  <div className="text-gray-500 mt-0.5 font-mono text-xs">
                                    {JSON.stringify(step.toolArgs, null, 2)}
                                  </div>
                                )}
                                {step.result && (
                                  <div className="text-gray-500 mt-0.5">
                                    → {step.result.preview}
                                  </div>
                                )}
                                {step.message && step.type === 'completion' && (
                                  <div className="text-gray-500 mt-0.5 italic">
                                    {step.message}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Main Message Content */}
                <div className={`rounded-2xl px-4 py-3 relative ${
                  msg.role === 'user' 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'bg-white/60 backdrop-blur-sm border border-gray-200/50 text-gray-800 shadow-sm'
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
                  
                  {/* Copy button for assistant messages - bottom right */}
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => copyMessage(idx, msg.content)}
                      className="absolute bottom-2 right-2 p-1 text-xs bg-white/80 hover:bg-white rounded transition-colors opacity-60 hover:opacity-100 shadow-sm"
                      title="Copy message"
                    >
                      {copiedMessage === idx ? '✓' : '📋 Copy'}
                    </button>
                  )}
                </div>
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