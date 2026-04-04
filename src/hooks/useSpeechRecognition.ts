/**
 * Web Speech API hook for voice dictation (same pattern as Domio-Serwis).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";

function getSpeechRecognition(): typeof SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface UseSpeechRecognitionOptions {
  onTranscript: (text: string) => void;
  lang?: string;
}

export function useSpeechRecognition({ onTranscript, lang = "pl-PL" }: UseSpeechRecognitionOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseTextRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const isSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interimTranscript += transcript;
        }
      }

      const baseText = baseTextRef.current.trim();
      const fullTranscript = finalTranscript + interimTranscript;
      const newText = baseText ? `${baseText} ${fullTranscript}`.trim() : fullTranscript.trim();

      onTranscriptRef.current(newText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("[useSpeechRecognition] Error:", event.error);
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

  const start = useCallback((currentText: string = "") => {
    if (!recognitionRef.current) return;
    baseTextRef.current = currentText;
    recognitionRef.current.start();
    setIsRecording(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  return { isRecording, start, stop, isSupported };
}
