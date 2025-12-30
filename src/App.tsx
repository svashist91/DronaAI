import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, Role, ChatSession } from '../types';
import { geminiService } from '../services/geminiService';
import MessageBubble from '../components/MessageBubble';
import InputBar from '../components/InputBar';
import VoiceOverlay from '../components/VoiceOverlay';
import Sidebar from '../components/Sidebar';
import { decode, decodeAudioData, createBlob } from '../utils/audioUtils';
import { LiveServerMessage } from '@google/genai';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser
} from "@clerk/clerk-react";
import { dbService } from '../services/dbService';

const LandingPage = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-6 text-center">
    <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl mb-8 transform rotate-12">
      <span className="text-5xl font-bold serif italic">D</span>
    </div>
    <h1 className="text-4xl md:text-6xl font-bold serif mb-6">Master Your Craft</h1>
    <p className="text-slate-400 text-lg max-w-xl mb-10 leading-relaxed">
      Drona is an AI mentor that sees what you see. Connect your screen and microphone for real-time, expert guidance on any task.
    </p>
    <SignInButton mode="modal">
      <button className="px-8 py-4 bg-white text-slate-900 rounded-full font-bold text-lg hover:bg-indigo-50 transition-all shadow-lg hover:shadow-indigo-500/20 transform hover:-translate-y-1">
        Start Mentorship
      </button>
    </SignInButton>
  </div>
  
);

const App: React.FC = () => {
  // 1. State Hooks
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('drona_theme');
    return saved !== 'light';
  });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const { user } = useUser();

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const lastActive = localStorage.getItem('drona_active_id');
    return lastActive || '';
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInteractionMode, setIsInteractionMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 2. Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const liveSessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionStreamRef = useRef<MediaStream | null>(null);

  const currentInputTransRef = useRef('');
  const currentOutputTransRef = useRef('');
  const lastUserMsgIdRef = useRef<string | null>(null);
  const lastDronaMsgIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);
  const activeSessionIdRef = useRef<string>('');

  // 3. Effects
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('drona_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('drona_theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      dbService.getSessions(user.id).then(data => {
        const parsed = data.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSessions(parsed);
        setIsLoading(false);
      }).catch(error => {
        console.error('Error loading sessions:', error);
        setIsLoading(false);
      });
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('drona_active_id', activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, scrollToBottom]);

  // 4. Helper Functions
  const createNewSession = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Session',
      messages: [],
      createdAt: new Date(),
    };
  
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
  
    // Persist immediately so it survives refresh
    if (user) {
      dbService.saveSession(newSession, user.id);
    }
  
    // If you have activeSessionIdRef, keep it synced
    if (typeof activeSessionIdRef !== 'undefined') {
      activeSessionIdRef.current = newId;
    }
  
    return newId;
  };
  

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dbService.deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) setActiveSessionId('');
  };

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);

    // If session exists but has no messages, refresh from DB
    const session = sessionsRef.current.find(s => s.id === id);
    if (user && (!session || session.messages.length === 0)) {
      try {
        const data = await dbService.getSessions(user.id);
        const parsed = data.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSessions(parsed);
      } catch (e) {
        console.error('Error refreshing sessions:', e);
      }
    }
  };

  const stopAllAudio = () => {
    sourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // noop
      }
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const startInteractionMode = async () => {
    if (isInteractionMode) {
      stopInteractionMode();
      return;
    }

    let sessionId = activeSessionIdRef.current || activeSessionId;
    if (!sessionId) {
      sessionId = createNewSession();
    }
    activeSessionIdRef.current = sessionId;
    setIsInteractionMode(true);
    setIsLoading(true);

    try {
      let visionStream: MediaStream | null = null;
      try {
        visionStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 5 }
        });
        visionStreamRef.current = visionStream;
      } catch (err) {
        console.warn("Screen share disallowed or cancelled:", err);
        setIsInteractionMode(false);
        setIsLoading(false);
        return;
      }

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      streamRef.current = audioStream;

      inputAudioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 24000 });

      sessionPromiseRef.current = geminiService.connectLive({
        onopen: () => {
          setIsLoading(false);

          const source = inputAudioContextRef.current!.createMediaStreamSource(
            audioStream
          );
          const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(
            4096,
            1,
            1
          );
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromiseRef.current?.then((session) => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContextRef.current!.destination);

          if (videoRef.current && visionStream) {
            videoRef.current.srcObject = visionStream;
            videoRef.current.play();

            frameIntervalRef.current = window.setInterval(() => {
              const canvas = canvasRef.current;
              const video = videoRef.current;
              if (
                canvas &&
                video &&
                video.readyState >= 2
              ) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0);
                  const base64 = canvas
                    .toDataURL('image/jpeg', 0.5)
                    .split(',')[1];
                  sessionPromiseRef.current?.then(session => {
                    session.sendRealtimeInput({
                      media: { data: base64, mimeType: 'image/jpeg' }
                    });
                  });
                }
              }
            }, 1000);
          }
        },
        onmessage: async (message: LiveServerMessage) => {
          const base64Audio =
            message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio && outputAudioContextRef.current) {
            setIsSpeaking(true);
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(
              nextStartTimeRef.current,
              ctx.currentTime
            );
            const audioBuffer = await decodeAudioData(
              decode(base64Audio),
              ctx,
              24000,
              1
            );
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) setIsSpeaking(false);
            });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }

          if (message.serverContent?.interrupted) {
            stopAllAudio();
            setIsSpeaking(false);
          }

          if (message.serverContent?.inputTranscription) {
            setIsListening(true);
            currentInputTransRef.current +=
              message.serverContent.inputTranscription.text;
            syncInteractionModeTranscription();
          }

          if (message.serverContent?.outputTranscription) {
            currentOutputTransRef.current +=
              message.serverContent.outputTranscription.text;
            syncInteractionModeTranscription();
          }

          if (message.serverContent?.turnComplete) {
            try {
              if (activeSessionIdRef.current) {
                if (lastUserMsgIdRef.current && currentInputTransRef.current.trim()) {
                  await dbService.saveMessage(
                    {
                      id: lastUserMsgIdRef.current,
                      role: Role.USER,
                      content: currentInputTransRef.current.trim(),
                      timestamp: new Date()
                    },
                    activeSessionIdRef.current
                  );
                }

                if (lastDronaMsgIdRef.current && currentOutputTransRef.current.trim()) {
                  await dbService.saveMessage(
                    {
                      id: lastDronaMsgIdRef.current,
                      role: Role.DRONA,
                      content: currentOutputTransRef.current.trim(),
                      timestamp: new Date()
                    },
                    activeSessionIdRef.current
                  );
                }
              }
            } catch (e) {
              console.error('Error saving interaction mode messages:', e);
            }

            setIsListening(false);
            currentInputTransRef.current = '';
            currentOutputTransRef.current = '';
            lastUserMsgIdRef.current = null;
            lastDronaMsgIdRef.current = null;
          }
        },
        onerror: (e) => {
          stopInteractionMode();
        },
        onclose: () => {
          stopInteractionMode();
        }
      });

      sessionPromiseRef.current.then(session => {
        liveSessionRef.current = session;
      });
    } catch (err) {
      console.error("Error starting interaction mode:", err);
      stopInteractionMode();
    }
  };

  const syncInteractionModeTranscription = () => {
    setSessions(prev =>
      prev.map(s => {
        if (s.id !== activeSessionIdRef.current) return s;

        let newMessages = [...s.messages];

        if (currentInputTransRef.current) {
          if (!lastUserMsgIdRef.current) {
            lastUserMsgIdRef.current =
              Date.now().toString() + '-int-u';
            newMessages.push({
              id: lastUserMsgIdRef.current,
              role: Role.USER,
              content: currentInputTransRef.current,
              timestamp: new Date()
            });
          } else {
            newMessages = newMessages.map(m =>
              m.id === lastUserMsgIdRef.current
                ? { ...m, content: currentInputTransRef.current }
                : m
            );
          }
        }

        if (currentOutputTransRef.current) {
          if (!lastDronaMsgIdRef.current) {
            lastDronaMsgIdRef.current =
              Date.now().toString() + '-int-d';
            newMessages.push({
              id: lastDronaMsgIdRef.current,
              role: Role.DRONA,
              content: currentOutputTransRef.current,
              timestamp: new Date(),
              isStreaming: true
            });
          } else {
            newMessages = newMessages.map(m =>
              m.id === lastDronaMsgIdRef.current
                ? { ...m, content: currentOutputTransRef.current }
                : m
            );
          }
        }

        const firstMsg =
          newMessages.find(m => m.role === Role.USER)?.content || s.title;
        const title =
          firstMsg.slice(0, 30) +
          (firstMsg.length > 30 ? '...' : '');

        // Persist title update to DB once we have real user text
        if (user && s.title === 'New Session' && title !== 'New Session') {
          dbService.saveSession(
            {
              id: s.id,
              title,
              createdAt: s.createdAt,
              messages: []
            } as any,
            user.id
          );
        }

        return { ...s, messages: newMessages, title };
      })
    );
  };

  const stopInteractionMode = () => {
    setIsInteractionMode(false);
    setIsSpeaking(false);
    setIsListening(false);
    setIsLoading(false);
    stopAllAudio();

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (visionStreamRef.current) {
      visionStreamRef.current.getTracks().forEach(t => t.stop());
      visionStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch (e) {}
      liveSessionRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
  };

  const handleSend = async (text: string) => {
    let currentId = activeSessionId;
    let userMsg: Message;
    if (!currentId) {
      const newId = Date.now().toString();
      currentId = newId;
      const newSession: ChatSession = {
        id: newId,
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        messages: [],
        createdAt: new Date(),
      };
      setSessions(prev => [newSession, ...prev]);

      // Generate userMsg here to save to DB below
      userMsg = {
        id: Date.now().toString(),
        role: Role.USER,
        content: text,
        timestamp: new Date()
      };
      dbService.saveMessage(userMsg, currentId);

      // Save the new session to the database
      dbService.saveSession(newSession, user!.id);

      setActiveSessionId(newId);
    } else {
      userMsg = {
        id: Date.now().toString(),
        role: Role.USER,
        content: text,
        timestamp: new Date()
      };
      // Save user message to database for existing sessions
      dbService.saveMessage(userMsg, currentId);
    }

    const dronaId = (Date.now() + 1).toString();
    const dronaMsg: Message = {
      id: dronaId,
      role: Role.DRONA,
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };

    setSessions(prev =>
      prev.map(s => {
        if (s.id === currentId) {
          const title =
            s.messages.length === 0
              ? text.slice(0, 30) +
                (text.length > 30 ? '...' : '')
              : s.title;
          return {
            ...s,
            messages: [...s.messages, userMsg, dronaMsg],
            title
          };
        }
        return s;
      })
    );

    // Persist session title update (only when first message sets title)
    if (user) {
      const newTitle = text.slice(0, 30) + (text.length > 30 ? '...' : '');
      const session = sessionsRef.current.find(s => s.id === currentId);

      // Only update DB if title is still default / empty
      if (!session || session.title === 'New Session') {
        dbService.saveSession(
          {
            id: currentId,
            title: newTitle,
            createdAt: session?.createdAt ?? new Date(),
            messages: [] // ok if dbService ignores this field
          } as any,
          user.id
        );
      }
    }

    setIsLoading(true);
    try {
      const history =
        (sessionsRef.current.find(s => s.id === currentId)?.messages || []).map(m => ({
          role: m.role === Role.USER ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

      const stream = geminiService.streamChat(history, text);
      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk;
        setSessions(prev =>
          prev.map(s => {
            if (s.id === currentId) {
              return {
                ...s,
                messages: s.messages.map(m =>
                  m.id === dronaId
                    ? { ...m, content: accumulated }
                    : m
                )
              };
            }
            return s;
          })
        );
      }
      setSessions(prev =>
        prev.map(s => {
          if (s.id === currentId) {
            return {
              ...s,
              messages: s.messages.map(m =>
                m.id === dronaId
                  ? { ...m, isStreaming: false }
                  : m
              )
            };
          }
          return s;
        })
      );
      
      // Save the complete AI response message to database
      const finalDronaMsg: Message = {
        id: dronaId,
        role: Role.DRONA,
        content: accumulated,
        timestamp: new Date()
      };
      dbService.saveMessage(finalDronaMsg, currentId);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Main Render Return
  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 overflow-hidden transition-colors duration-300">
      {/* 1. STATE: User is Signed OUT */}
      <SignedOut>
        <LandingPage />
      </SignedOut>

      {/* 2. STATE: User is Signed IN */}
      <SignedIn>
        <video ref={videoRef} className="hidden" aria-hidden="true" />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        <VoiceOverlay
          isActive={isInteractionMode}
          isSpeaking={isSpeaking}
          isListening={isListening}
          onClose={stopInteractionMode}
        />

        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={createNewSession}
          onDeleteSession={deleteSession}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        <div className="flex-1 flex flex-col relative min-w-0">
          <header className="flex items-center justify-between px-6 py-4 bg-slate-100 dark:bg-slate-900/50 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 z-10">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </button>
              <div className="hidden sm:flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-lg shadow-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                  </svg>
                </div>
                <div className="leading-tight">
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white serif italic">
                    Drona
                  </h1>
                  <p className="text-[9px] text-slate-500 dark:text-slate-500 font-bold uppercase tracking-widest">
                    Master Mentor
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
                title={
                  isDarkMode
                    ? "Switch to Daylight Mode"
                    : "Switch to Dark Mode"
                }
              >
                {isDarkMode ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                )}
              </button>

              <UserButton
                appearance={{
                  elements: {
                    avatarBox:
                      "w-10 h-10 border-2 border-indigo-500 rounded-full"
                  }
                }}
              />
            </div>
          </header>

          <main
            className="flex-1 overflow-y-auto px-4 py-8 relative"
            ref={scrollRef}
          >
            <div className="max-w-4xl mx-auto min-h-full flex flex-col">
              {!activeSession ||
              activeSession.messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-700">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-10 rounded-full animate-pulse"></div>
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl transform rotate-12">
                      <span className="text-3xl font-bold text-white serif italic">
                        D
                      </span>
                    </div>
                  </div>
                  <div className="max-w-md px-6">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white serif mb-3 italic">
                      Welcome to the Arena of Wisdom
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                      I am Drona, your master AI mentor. Start a conversation or hit the icon to begin your real-time <b>Interaction Mode</b> session.
                    </p>
                  </div>
                </div>
              ) : (
                activeSession.messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
            </div>
          </main>

          <InputBar
            onSend={handleSend}
            onVoiceClick={startInteractionMode}
            isVoiceActive={isInteractionMode}
            disabled={isLoading}
          />
        </div>
      </SignedIn>
    </div>
  );
};

export default App;