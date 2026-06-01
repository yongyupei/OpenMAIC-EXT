/**
 * @extends-from lib/hooks/use-audio-recorder.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { useState, useRef, useCallback } from 'react';
import { ASR_PROVIDERS } from '@/lib/audio/constants';
import {
  createBrowserSpeechRecognition,
  isBrowserSpeechRecognitionSupported,
  pickServerAsrFallback,
  toBrowserSpeechLanguage,
} from '@/lib/audio/asr-client-utils';
import { normalizeASRUploadAudio } from '@/lib/audio/wav-utils';
import type { ASRProviderId } from '@/lib/audio/types';
import { getClientTranslation } from '@/lib/i18n';
import { createLogger } from '@/lib/logger';

const log = createLogger('AudioRecorder');

export interface UseAudioRecorderOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
  /** Called when falling back from browser ASR to server ASR after a failure. */
  onFallbackNotice?: (message: string) => void;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onTranscription, onError, onFallbackNotice } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const browserTranscriptRef = useRef('');
  const transcribeProviderOverrideRef = useRef<ASRProviderId | undefined>(undefined);
  const busyRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetRecordingUi = useCallback(() => {
    busyRef.current = false;
    setIsRecording(false);
    setRecordingTime(0);
    clearTimer();
  }, [clearTimer]);

  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);

      try {
        const formData = new FormData();

        if (typeof window !== 'undefined') {
          const { useSettingsStore } = await import('@/lib/store/settings');
          const { asrProviderId, asrLanguage, asrProvidersConfig } = useSettingsStore.getState();
          const overrideId = transcribeProviderOverrideRef.current;
          transcribeProviderOverrideRef.current = undefined;

          const effectiveProviderId = overrideId ?? asrProviderId;
          if (effectiveProviderId === 'browser-native') {
            throw new Error('No server ASR provider configured');
          }

          const uploadAudio = await normalizeASRUploadAudio(effectiveProviderId, audioBlob);
          formData.append('audio', uploadAudio.blob, uploadAudio.fileName);
          formData.append('providerId', effectiveProviderId);
          formData.append(
            'modelId',
            asrProvidersConfig?.[effectiveProviderId]?.modelId ||
              ASR_PROVIDERS[effectiveProviderId as keyof typeof ASR_PROVIDERS]?.defaultModelId ||
              '',
          );
          formData.append('language', asrLanguage);

          const providerConfig = asrProvidersConfig?.[effectiveProviderId];
          if (providerConfig?.apiKey?.trim()) {
            formData.append('apiKey', providerConfig.apiKey);
          }
          const effectiveBaseUrl =
            providerConfig?.baseUrl?.trim() || providerConfig?.customDefaultBaseUrl || '';
          if (effectiveBaseUrl) {
            formData.append('baseUrl', effectiveBaseUrl);
          }
        } else {
          formData.append('audio', audioBlob, 'recording.webm');
        }

        const response = await fetch('/api/extends/transcription', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Transcription failed');
        }

        const result = await response.json();
        onTranscription?.(result.text);
      } catch (error) {
        log.error('Transcription error:', error);
        onError?.(error instanceof Error ? error.message : '语音识别失败，请重试');
      } finally {
        setIsProcessing(false);
        setRecordingTime(0);
      }
    },
    [onTranscription, onError],
  );

  const startMediaRecorderCapture = useCallback(
    async (providerOverride?: ASRProviderId) => {
      busyRef.current = true;

      if (providerOverride) {
        transcribeProviderOverrideRef.current = providerOverride;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });

        await transcribeAudio(audioBlob);
        busyRef.current = false;
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    },
    [transcribeAudio],
  );

  const tryServerAsrFallback = useCallback(
    async (noticeMessage?: string) => {
      const { useSettingsStore } = await import('@/lib/store/settings');
      const { asrProvidersConfig } = useSettingsStore.getState();
      const fallbackId = pickServerAsrFallback(asrProvidersConfig);
      if (!fallbackId) return false;

      if (noticeMessage) {
        onFallbackNotice?.(noticeMessage);
      }

      try {
        await startMediaRecorderCapture(fallbackId);
        return true;
      } catch (error) {
        log.error('Server ASR fallback failed:', error);
        resetRecordingUi();
        onError?.(getClientTranslation('voice.micCaptureFailed'));
        return false;
      }
    },
    [onError, onFallbackNotice, resetRecordingUi, startMediaRecorderCapture],
  );

  const startBrowserSpeechRecognition = useCallback(
    (asrLanguage: string) => {
      if (!isBrowserSpeechRecognitionSupported()) {
        resetRecordingUi();
        onError?.(getClientTranslation('voice.browserNotSupported'));
        return;
      }

      const recognition = createBrowserSpeechRecognition();
      if (!recognition) {
        resetRecordingUi();
        onError?.(getClientTranslation('voice.browserNotSupported'));
        return;
      }

      browserTranscriptRef.current = '';
      recognition.lang = toBrowserSpeechLanguage(asrLanguage);
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setRecordingTime(0);
        timerRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0]?.transcript ?? '';
        }
        browserTranscriptRef.current = transcript;
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        log.error('Speech recognition error:', event.error);

        switch (event.error) {
          case 'aborted':
            resetRecordingUi();
            return;
          case 'network': {
            void (async () => {
              resetRecordingUi();
              const ok = await tryServerAsrFallback(
                getClientTranslation('voice.fallbackToServerAsr'),
              );
              if (!ok) {
                onError?.(getClientTranslation('voice.browserNetworkUnavailable'));
              }
            })();
            return;
          }
          case 'no-speech':
            onError?.(getClientTranslation('voice.noSpeech'));
            break;
          case 'audio-capture':
            onError?.(getClientTranslation('voice.micCaptureFailed'));
            break;
          case 'not-allowed':
            onError?.(getClientTranslation('voice.micDenied'));
            break;
          default:
            onError?.(`${getClientTranslation('voice.browserRecognitionFailed')}: ${event.error}`);
        }

        if (event.error !== 'network') {
          resetRecordingUi();
        }
      };

      recognition.onend = () => {
        const text = browserTranscriptRef.current.trim();
        browserTranscriptRef.current = '';
        speechRecognitionRef.current = null;
        resetRecordingUi();
        if (text) {
          onTranscription?.(text);
        }
      };

      try {
        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch (error) {
        log.error('Failed to start browser speech recognition:', error);
        resetRecordingUi();
        onError?.(getClientTranslation('voice.browserStartFailed'));
      }
    },
    [onError, onTranscription, resetRecordingUi, tryServerAsrFallback],
  );

  const startRecording = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      if (typeof window === 'undefined') {
        busyRef.current = false;
        return;
      }

      const { useSettingsStore } = await import('@/lib/store/settings');
      const { asrProviderId, asrLanguage } = useSettingsStore.getState();

      if (asrProviderId === 'browser-native') {
        startBrowserSpeechRecognition(asrLanguage);
        return;
      }

      await startMediaRecorderCapture(asrProviderId);
    } catch (error) {
      busyRef.current = false;
      log.error('Failed to start recording:', error);
      onError?.(getClientTranslation('voice.micCaptureFailed'));
    }
  }, [onError, startBrowserSpeechRecognition, startMediaRecorderCapture]);

  const stopRecording = useCallback(() => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      resetRecordingUi();
    }
  }, [isRecording, resetRecordingUi]);

  const cancelRecording = useCallback(() => {
    if (speechRecognitionRef.current) {
      browserTranscriptRef.current = '';
      speechRecognitionRef.current.onresult = null;
      speechRecognitionRef.current.onerror = null;
      speechRecognitionRef.current.abort();
      speechRecognitionRef.current = null;
      resetRecordingUi();
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();

      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }

      resetRecordingUi();
      audioChunksRef.current = [];
    }
  }, [isRecording, resetRecordingUi]);

  return {
    isRecording,
    isProcessing,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
