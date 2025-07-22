// components/ChatInterface.tsx
'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';

// Define the structure of a message
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Effect to scroll to the bottom of the chat window on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const userInput = formData.get('message') as string;

    if (!userInput.trim()) return;

    // Add user message to the chat and set loading state
    const newMessages: Message[] = [...messages, { role: 'user', content: userInput }];
    setMessages(newMessages);
    setIsLoading(true);

    e.currentTarget.reset();

    try {
      // Send the entire message history to our backend API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      const data = await response.json();

      // Add the AI's response to the chat
      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      console.error("Error fetching from chat API:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      setMessages([...newMessages, { role: 'assistant', content: `Sorry, something went wrong: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white">
      <header className="p-4 border-b">
        <h1 className="text-2xl font-bold text-center">Fin-Agent 📈</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`p-4 rounded-lg shadow-md max-w-lg whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p dangerouslySetInnerHTML={{ __html: msg.content.replace(/\[/g, '<span class="text-xs font-semibold bg-gray-300 text-gray-600 px-1 py-0.5 rounded-sm">[').replace(/\]/g, ']</span>') }} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="p-4 rounded-lg shadow-md bg-gray-100 text-gray-800">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            name="message"
            type="text"
            className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Ask about a company's financials..."
            disabled={isLoading}
            autoComplete="off"
          />
          <button
            type="submit"
            className="p-3 bg-blue-600 text-white rounded-lg disabled:bg-blue-400 transition-colors"
            disabled={isLoading}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}