
import React from 'react';

interface VoiceOverlayProps {
  isActive: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  onClose: () => void;
}

const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ isActive, isSpeaking, isListening, onClose }) => {
  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
      <button 
        onClick={onClose}
        className="absolute top-8 right-8 text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div className="relative flex flex-col items-center justify-center gap-12">
        
        {/* 1. Avatar Area with Output Rings */}
        <div className="relative flex items-center justify-center">
          {/* Outer Speaking Ring */}
          <div className={`absolute w-72 h-72 rounded-full border-2 border-indigo-500/30 transition-all duration-300 ${isSpeaking ? 'scale-110 opacity-100 animate-pulse' : 'scale-90 opacity-0'}`}></div>
          {/* Inner Speaking Ring */}
          <div className={`absolute w-60 h-60 rounded-full border border-indigo-500/50 transition-all duration-300 ${isSpeaking ? 'scale-105 opacity-100' : 'scale-90 opacity-0'}`}></div>

          {/* Main Avatar Circle */}
          <div className={`relative w-40 h-40 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-2xl z-20 transition-transform duration-500 ${isSpeaking ? 'scale-105 shadow-indigo-500/40' : 'scale-100'}`}>
            <span className="text-6xl font-bold text-white serif italic">D</span>
            
            {/* Small Mic Icon Indicator (Shows when you are speaking) */}
            <div className={`absolute -bottom-3 -right-3 bg-slate-900 border-4 border-slate-950 rounded-full p-3 transition-transform duration-300 ${isListening ? 'scale-100' : 'scale-0'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* 2. Status Indicators (Vision + Audio) */}
        <div className="flex gap-8">
          
          {/* Vision Active Badge */}
          <div className="flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
             <div className="relative flex h-3 w-3">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
             </div>
             <div className="flex flex-col">
               <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Vision Active</span>
               <span className="text-[10px] text-slate-500">Processing Screens</span>
             </div>
          </div>

          {/* Audio Status Badge */}
          <div className={`flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800 transition-opacity duration-300 ${isListening ? 'opacity-100' : 'opacity-50'}`}>
             <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-indigo-500 animate-pulse' : 'bg-slate-600'}`}></div>
             <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
               {isListening ? 'Listening...' : 'Mic Ready'}
             </span>
          </div>
        </div>

        {/* 3. Dynamic Text Feedback */}
        <div className="text-center space-y-2 h-16">
          {isSpeaking && (
            <p className="text-lg font-medium text-white animate-in slide-in-from-bottom-2 fade-in">
              " I'm explaining the next step... "
            </p>
          )}
          {!isSpeaking && isListening && (
            <p className="text-lg font-medium text-slate-400 animate-in slide-in-from-bottom-2 fade-in">
              " Listening to you... "
            </p>
          )}
           {!isSpeaking && !isListening && (
            <p className="text-sm font-medium text-slate-500 italic">
              Watching your screen. Ask me anything.
            </p>
          )}
        </div>

      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 10px; }
          50% { height: 40px; }
        }
      `}</style>
    </div>
  );
};

export default VoiceOverlay;
