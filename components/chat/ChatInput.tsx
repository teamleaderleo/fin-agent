import React, { useRef, useEffect } from "react";

// components/chat/ChatInput.tsx
interface Props {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  isDarkMode: boolean;
}

export function ChatInput({ input, setInput, handleSubmit, isLoading, isDarkMode }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!isLoading) inputRef.current?.focus(); }, [isLoading]);

  return (
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
  );
}