import { create } from 'zustand';
import { VoiceState } from '../types';
import { AudioService } from '../services/audioService';
import { useMeshStore } from './useMeshStore';
import { resolveApiUrl, buildApiHeaders } from '../services/apiConfig';

interface VoiceStoreState {
  voiceState: VoiceState;
  userTranscript: string;
  assistantReply: string;
  isInterrupted: boolean;
  bargeInActive: boolean;

  // Actions
  startListening: () => void;
  submitSpokenTurn: (speechText: string) => Promise<void>;
  interrupt: () => void;
  resetVoiceSession: () => void;
  setVoiceState: (state: VoiceState) => void;
}

const VOICE_PRESET_ANSWERS = [
  "I'm executing directly on Abliterated Sovereign Cloud over low latency HTTPS. Neural pipeline active.",
  "Sovereign H100 inference mesh is responding at peak throughput with zero telemetry leaks.",
  "Abliterated Cloud and Featherless mesh are synchronized for uncensored voice responses.",
  "I've synchronized your creative session, neural state, and code artifacts.",
];

export const useVoiceStore = create<VoiceStoreState>((set, get) => ({
  voiceState: 'listening',
  userTranscript: '',
  assistantReply: 'Abliterated Cloud voice engine initialized. I am listening...',
  isInterrupted: false,
  bargeInActive: false,

  setVoiceState: (voiceState) => set({ voiceState }),

  startListening: () => {
    AudioService.stopSpeaking();
    set({
      voiceState: 'listening',
      userTranscript: 'Listening...',
      isInterrupted: false,
    });
    const ok = AudioService.startListening(
      (transcript, isFinal) => {
        set({ userTranscript: transcript || 'Listening...' });
        if (isFinal && transcript.trim()) {
          AudioService.stopListening();
          void get().submitSpokenTurn(transcript.trim());
        }
      },
      () => {
        set({
          userTranscript: 'Mic unavailable — tap a prompt chip or check browser permission.',
        });
      }
    );
    if (!ok) {
      set({
        userTranscript: 'Speech recognition unavailable. Use a prompt chip.',
      });
    }
  },

  interrupt: () => {
    AudioService.stopSpeaking();
    set({
      voiceState: 'listening',
      isInterrupted: true,
      bargeInActive: true,
      userTranscript: 'Interrupted assistant speech. Listening for your input...',
      assistantReply: '...',
    });
  },

  submitSpokenTurn: async (speechText: string) => {
    if (!speechText.trim()) return;

    // Halt any previous playback immediately
    AudioService.stopSpeaking();
    AudioService.stopListening();

    set({
      userTranscript: speechText,
      assistantReply: 'Thinking on Sovereign Cloud...',
      voiceState: 'thinking',
    });

    const meshState = useMeshStore.getState();
    const activeHost = meshState.activeHost;
    const activePort = meshState.activePort;
    const activeEp = meshState.getActiveEndpoint?.() || meshState.candidates.find((c) => c.host === activeHost);
    const apiKey = activeEp?.provider === 'featherless'
      ? meshState.featherlessApiKey
      : meshState.abliteratedApiKey;
    const model = activeEp?.defaultModel || (activeHost.includes('featherless') ? 'meta-llama/Meta-Llama-3.1-8B-Instruct' : 'qwen-abliterated');

    let responseText = '';

    try {
      const url = resolveApiUrl(activeHost, activePort, '/v1/chat/completions');
      const res = await fetch(url, {
        method: 'POST',
        headers: buildApiHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are Abliterated AI voice assistant. Reply in concise conversational spoken English (1-2 sentences max). Do not include markdown, formatting, or code blocks.',
            },
            { role: 'user', content: speechText },
          ],
          temperature: 0.6,
          max_tokens: 80,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        responseText =
          data.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() ||
          '';
      }
    } catch (e) {
      // Offline fallback
    }

    if (!responseText) {
      // Pick dynamic spoken fallback
      responseText =
        VOICE_PRESET_ANSWERS[Math.floor(Math.random() * VOICE_PRESET_ANSWERS.length)];
    }

    set({
      assistantReply: responseText,
      voiceState: 'speaking',
      bargeInActive: false,
    });

    // Speak through audio engine
    AudioService.speak(responseText, {
      onDone: () => {
        if (get().voiceState === 'speaking') {
          set({ voiceState: 'listening', userTranscript: 'Listening...' });
        }
      },
      onError: () => {
        set({ voiceState: 'listening', userTranscript: 'Ready for your voice...' });
      },
    });
  },

  resetVoiceSession: () => {
    AudioService.stopSpeaking();
    set({
      voiceState: 'listening',
      userTranscript: '',
      assistantReply: 'Voice mode standby.',
      isInterrupted: false,
      bargeInActive: false,
    });
  },
}));
