import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSectionGuideOptions {
  sectionKey: string;
  userId?: string | null;
  delay?: number;
}

export function useSectionGuide({ sectionKey, userId, delay = 700 }: UseSectionGuideOptions) {
  const [showGuide, setShowGuide] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const focusedRef = useRef(false);
  const identity = userId ?? 'guest';
  const completedKey = `pawalert:coach-marks:${sectionKey}:v1:${identity}`;
  const promptKey = `pawalert:coach-marks:${sectionKey}:prompt:v1:${identity}`;

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
        setShowGuide(false);
        setShowPrompt(false);
      };
    }, []),
  );

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const [completed, promptSeen] = await Promise.all([
          AsyncStorage.getItem(completedKey),
          AsyncStorage.getItem(promptKey),
        ]);
        if (active && focusedRef.current && completed !== 'completed' && promptSeen !== 'seen') {
          setShowPrompt(true);
        }
      } catch {
        // El acceso manual permanece disponible si falla el almacenamiento.
      }
    }, delay);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [completedKey, delay, promptKey]);

  const rememberPrompt = useCallback(async () => {
    try {
      await AsyncStorage.setItem(promptKey, 'seen');
    } catch {
      // No bloqueamos el recorrido si no se puede guardar la preferencia.
    }
  }, [promptKey]);

  const startGuide = useCallback(() => {
    setShowPrompt(false);
    void rememberPrompt();
    setShowGuide(true);
  }, [rememberPrompt]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    void rememberPrompt();
  }, [rememberPrompt]);

  const closeGuide = useCallback(async (completed: boolean) => {
    setShowGuide(false);
    if (!completed) return;
    try {
      await AsyncStorage.setItem(completedKey, 'completed');
    } catch {
      // Finalizar nunca debe bloquear la navegación.
    }
  }, [completedKey]);

  return {
    showGuide,
    showPrompt,
    startGuide,
    dismissPrompt,
    closeGuide,
  };
}
