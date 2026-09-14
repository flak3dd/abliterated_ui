import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

export class AudioService {
  private static isSpeakingNative = false;
  private static recognitionInstance: any = null;

  static async speak(
    text: string,
    options?: {
      onStart?: () => void;
      onDone?: () => void;
      onError?: (error: any) => void;
    }
  ): Promise<void> {
    this.stopSpeaking();

    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
          this.isSpeakingNative = true;
          options?.onStart?.();
        };

        utterance.onend = () => {
          this.isSpeakingNative = false;
          options?.onDone?.();
        };

        utterance.onerror = (e) => {
          this.isSpeakingNative = false;
          options?.onError?.(e);
        };

        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.warn('Web speech synthesis fallback error:', err);
      }
    }

    try {
      this.isSpeakingNative = true;
      options?.onStart?.();

      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 1.0,
        onDone: () => {
          this.isSpeakingNative = false;
          options?.onDone?.();
        },
        onError: (err) => {
          this.isSpeakingNative = false;
          options?.onError?.(err);
        },
      });
    } catch (e) {
      this.isSpeakingNative = false;
      options?.onDone?.();
    }
  }

  static stopSpeaking(): void {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    try {
      Speech.stop();
    } catch (e) {}

    this.isSpeakingNative = false;
  }

  static isSpeaking(): boolean {
    return this.isSpeakingNative;
  }
}
