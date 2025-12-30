
//import { GoogleGenAI, GenerateContentResponse, Modality, LiveServerMessage } from "@google/genai";

// export class GeminiService {
//   private ai: GoogleGenAI;
//   private modelName = 'gemini-3-pro-preview';
//   private liveModelName = 'gemini-2.5-flash-native-audio-preview-09-2025';

//   constructor() {
//     this.ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GOOGLE_API_KEY });
//   }

//   private getSystemInstruction(isLive: boolean = false) {
//     const now = new Date();
//     const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
//     const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
//     const base = `You are Drona, a wise, patient, and highly intelligent AI mentor. 
//     Your goal is to guide students and seekers through complex topics with clarity and depth. 
//     Adopt a calm, authoritative yet encouraging tone. 
//     IMPORTANT: Current Date is ${dateStr} and Current Time is ${timeStr}. Use this information to answer any questions about the current date, time, or for performing calculations involving time.`;

//     if (isLive) {
//       return `${base} You are engaging in "Interaction Mode" (real-time voice and vision). 
    
//     You are now in "Interaction Mode" (Live Vision + Voice).
//       You are looking at the user's screen and listening to them.

//       CORE BEHAVIOR PROTOCOL: "THE PATIENT TEACHER"
//       1. GOAL: Do not just answer. Guide the user to the solution step-by-step.
//       2. TONE: Calm, slow-paced, and reassuring. Like a senior engineer sitting next to a junior.

//       INTERACTION LOOP (Follow this strictly):
      
//       PHASE 1: SUMMARIZE (The Roadmap)
//       - When the user states a goal, briefly explain the high-level steps (e.g., "To fix this, we need to update the config and restart the server. Let's start with the config.").
      
//       PHASE 2: GUIDE (One step at a time)
//       - Give ONLY ONE instruction at a time. (e.g., "Click on the 'Settings' gear icon in the top right.").
//       - DO NOT give the next step until you verify the current one is done.
      
//       PHASE 3: VERIFY (The Watchdog)
//       - Watch the screen. If the user successfully performs the action, say "Great" or "Perfect", then give the next step.
//       - If the user is lost (screen doesn't change for >10s), offer a hint: "I'm looking for the gear icon. It should be near your profile picture."
//       - SAFETY INTERVENTION: If you see Red Text (Errors) or a dangerous action, interrupt immediately: "Hold on, I see an error. Let's fix that first."

//       Keep your verbal responses concise (1-2 sentences max). Allow the user to focus.`;
//     }
//     return `${base} Respond in Markdown format.`;
//   }

//   async *streamChat(history: { role: string; parts: { text: string }[] }[], prompt: string) {
//     const chat = this.ai.chats.create({
//       model: this.modelName,
//       config: {
//         systemInstruction: this.getSystemInstruction(),
//         temperature: 0.7,
//       }
//     });

//     const result = await chat.sendMessageStream({ message: prompt });
    
//     for await (const chunk of result) {
//       const response = chunk as GenerateContentResponse;
//       yield response.text || '';
//     }
//   }

//   connectLive(callbacks: {
//     onopen: () => void;
//     onmessage: (message: LiveServerMessage) => void;
//     onerror: (e: ErrorEvent) => void;
//     onclose: (e: CloseEvent) => void;
//   }) {
//     const liveAi = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GOOGLE_API_KEY });
//     return liveAi.live.connect({
//       model: this.liveModelName,
//       callbacks,
//       config: {
//         responseModalities: [Modality.AUDIO],
//         speechConfig: {
//           voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
//         },
//         inputAudioTranscription: {},
//         outputAudioTranscription: {},
//         systemInstruction: this.getSystemInstruction(true),
//       },
//     });
//   }
// }

// export const geminiService = new GeminiService();



// Remove GoogleGenAI imports - we don't want the SDK logic here anymore!
// You might keep types if needed, but don't instantiate the client.

export class GeminiService {
  private proxyUrl = 'http://localhost:3001';
  private wsUrl = 'ws://localhost:3001';

  // 1. Text Chat via Proxy
  async *streamChat(history: any[], prompt: string) {
    const response = await fetch(`${this.proxyUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, history })
    });

    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  }

  // 2. Live Mode via WebSocket Proxy
  connectLive(callbacks: {
    onopen: () => void;
    onmessage: (message: any) => void;
    onerror: (e: Event) => void;
    onclose: (e: CloseEvent) => void;
  }) {
    const ws = new WebSocket(this.wsUrl);

    ws.onopen = () => {
      callbacks.onopen();
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      callbacks.onmessage(msg);
    };

    ws.onerror = (e) => callbacks.onerror(e);
    ws.onclose = (e) => callbacks.onclose(e);

    // Return an object that mimics the SDK session interface
    return Promise.resolve({
      sendRealtimeInput: (input: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          // Wrap the input in a structure the server expects
          ws.send(JSON.stringify({ realtimeInput: input }));
        }
      },
      close: () => ws.close()
    });
  }
}

export const geminiService = new GeminiService();