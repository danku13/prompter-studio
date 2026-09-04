'use client';

/**
 * Слой (e) суфлёра: обратный отсчёт 3 → 2 → 1 → «Съёмка!»
 * перед стартом прокрутки и записи. Гигантские цифры, синий брендовый акцент.
 */

import { AnimatePresence, motion } from 'framer-motion';

export type CountdownPhase = number | 'go' | null;

export default function CountdownOverlay({ phase }: { phase: CountdownPhase }) {
  return (
    <AnimatePresence>
      {phase !== null && (
        <motion.div
          key="countdown-backdrop"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/75"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={phase === 'go' ? 'go' : `n-${String(phase)}`}
              initial={{ scale: 1.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.55, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={
                phase === 'go'
                  ? 'text-6xl font-bold text-blue-400'
                  : 'text-[34vw] font-bold leading-none tabular-nums text-white'
              }
            >
              {phase === 'go' ? 'Съёмка!' : phase}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
