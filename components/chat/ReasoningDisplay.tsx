// components/chat/ReasoningDisplay.tsx
import { useState } from 'react';
import { copyReasoningToClipboard } from './utils';

interface Props {
  reasoning: any[];
  stepCount: number;
  isDarkMode: boolean;
}

export function ReasoningDisplay({ reasoning, stepCount, isDarkMode }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyReasoningToClipboard(reasoning);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className={`backdrop-blur-sm border rounded-lg overflow-hidden transition-colors ${ isDarkMode ? 'bg-gray-800/40 border-gray-700/50' : 'bg-white/40 border-gray-200/50'}`}>
      <div onClick={() => setIsExpanded(!isExpanded)} className={`px-3 py-2 hover:bg-opacity-60 transition-all duration-200 cursor-pointer ${ isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-white/60'}`}>
        <div className={`flex items-center justify-between text-sm transition-colors ${ isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          <div className="flex items-center gap-2 select-none flex-1">
            <span className="text-xs">🧠</span>
            <span>Used {stepCount} reasoning steps</span>
            <span className={`text-xs transition-colors ${ isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Click to expand</span>
            <span className={`transform transition-transform ${ isDarkMode ? 'text-gray-500' : 'text-gray-400'} ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
          </div>
          <button onClick={handleCopy} className={`ml-2 px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${ isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700' }`}>
            {isCopied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className={`px-3 pb-3 pt-0 border-t space-y-3 select-text transition-colors ${ isDarkMode ? 'border-gray-700/50' : 'border-gray-200/50'}`}>
          {reasoning.map((step, stepIdx) => (
            <div key={stepIdx} className="text-xs pt-2">
              <div className="flex items-start gap-2">
                <span className={`font-mono mt-0.5 select-none transition-colors ${ isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{step.step}.</span>
                <div className="flex-1">
                  <div className={`font-medium flex items-center gap-1 transition-colors ${ isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    {step.type === 'tool_step' && `🚀 ${step.toolName}`}
                    {step.type === 'completion' && '🏁 Finished'}
                  </div>
                  {step.toolArgs && (<pre className={`mt-1 font-mono text-xs whitespace-pre-wrap p-2 rounded ${isDarkMode ? 'bg-gray-900/50 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>{JSON.stringify(step.toolArgs, null, 2)}</pre>)}
                  {step.result && (<div className={`mt-0.5 transition-colors ${ isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>→ {step.result.preview}</div>)}
                  {step.message && step.type === 'completion' && (<div className={`mt-0.5 italic transition-colors ${ isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{step.message}</div>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}