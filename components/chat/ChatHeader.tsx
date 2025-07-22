// components/chat/ChatHeader.tsx
import React from 'react';

interface Props {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ChatHeader({ isDarkMode, toggleDarkMode, setShowHistory }: Props) {
  return (
    <div className={`backdrop-blur-sm border-b px-6 py-4 transition-colors ${isDarkMode ? 'bg-gray-900/80 border-gray-700/50' : 'bg-white/80 border-gray-200/50'}`}>
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowHistory(s => !s)} className={`p-2 rounded-lg transition-colors ${ isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700' }`} title="Toggle chat history">
            📂
          </button>
          <div>
            <h1 className={`text-2xl font-bold transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>fin-agent</h1>
            <p className={`text-sm mt-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Financial data at your fingertips</p>
          </div>
        </div>
        <button onClick={toggleDarkMode} className={`p-2 rounded-lg transition-colors ${ isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}