import { useCallback, useEffect, useRef, useState } from "react";
import {
  simulateMonteCarlo,
  type MonteCarloInput,
  type MonteCarloResult,
} from "./simulate-monte-carlo";

const DEBOUNCE_MS = 300;

const EMPTY_RESULT: MonteCarloResult = {
  yearlyData: [],
  failureProbability: 0,
  depletionProbability: 0,
  distribution: [],
};

export function useMonteCarloSimulator(input: MonteCarloInput): [MonteCarloResult, () => void] {
  const [result, setResult] = useState<MonteCarloResult>(EMPTY_RESULT);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isFirstRef = useRef(true);
  const immediateNextRef = useRef(false);
  const inputJson = JSON.stringify(input);

  const requestImmediate = useCallback(() => {
    immediateNextRef.current = true;
  }, []);

  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false;
      setResult(simulateMonteCarlo(input));
      return;
    }
    clearTimeout(timerRef.current);
    if (immediateNextRef.current) {
      immediateNextRef.current = false;
      setResult(simulateMonteCarlo(input));
    } else {
      timerRef.current = setTimeout(() => {
        setResult(simulateMonteCarlo(input));
      }, DEBOUNCE_MS);
    }
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputJson]);

  return [result, requestImmediate];
}
