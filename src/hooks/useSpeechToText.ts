/**
 * Web Speech API — append-friendly dictation for controlled fields (react-hook-form).
 * Accumulates final segments across multiple onresult events (continuous mode).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";

function getSpeechRecognitionCtor(): typeof SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function mergeWithBase(base: string, tail: string): string {
  const b = base.trimEnd();
  const t = tail.trim();
  if (!t) return b;
  if (!b) return t;
  return `${b} ${t}`;
}

export interface UseSpeechToTextOptions {
  /** Called with the full updated text (base + dictated session) on each recognition update. */
  onTextUpdate: (fullText: string) => void;
  lang?: string;
}

export function useSpeechToText({ onTextUpdate, lang = "pl-PL" }: UseSpeechToTextOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseTextRef = useRef("");
  const sessionFinalRef = useRef("");
  const onTextUpdateRef = useRef(onTextUpdate);
  onTextUpdateRef.current = onTextUpdate;

  const isSupported = typeof window !== "undefined" && !!getSpeechRecognitionCtor();

  useEffect(() => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let newFinalChunk = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinalChunk += piece;
        } else {
          interimTranscript += piece;
        }
      }

      if (newFinalChunk) {
        sessionFinalRef.current += newFinalChunk;
      }

      const sessionTail = `${sessionFinalRef.current}${interimTranscript}`;
      const merged = mergeWithBase(baseTextRef.current, sessionTail);
      onTextUpdateRef.current(merged);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("[useSpeechToText] Error:", event.error);
      setIsRecording(false);

      if (event.error === "no-speech") {
        toast.info("Nie wykryto mowy. Spróbuj ponownie.");
      } else if (event.error === "audio-capture") {
        toast.error("Nie można uzyskać dostępu do mikrofonu.");
      } else if (event.error === "not-allowed") {
        toast.error("Brak uprawnień do mikrofonu.");
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback((currentFieldValue: string) => {
    if (!recognitionRef.current) return;
    baseTextRef.current = currentFieldValue;
    sessionFinalRef.current = "";
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (e) {
      console.error("[useSpeechToText] start:", e);
      setIsRecording(false);
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  return { isRecording, start, stop, isSupported };
}
