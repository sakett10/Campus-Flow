export interface TemporalSplitConfig {
  trainEnd: string | Date;
  validationStart: string | Date;
  validationEnd: string | Date;
  testStart: string | Date;
  testEnd?: string | Date | undefined;
}

export interface TemporalSplitResult<T> {
  train: T[];
  validation: T[];
  test: T[];
  splitsSummary: {
    trainCount: number;
    validationCount: number;
    testCount: number;
    trainRange: { start: string; end: string };
    validationRange: { start: string; end: string };
    testRange: { start: string; end: string };
  };
}

/**
 * Partitions dataset into strictly sequential out-of-time splits:
 * Train -> Validation (Out-of-time 1) -> Test (Out-of-time 2).
 * Strictly guarantees that future rows do not leak into train sets.
 */
export function createTemporalSplit<T extends { applicationTimestamp: string | Date }>(
  items: T[],
  config: TemporalSplitConfig,
): TemporalSplitResult<T> {
  const trainEndTime = new Date(config.trainEnd).getTime();
  const valStartTime = new Date(config.validationStart).getTime();
  const valEndTime = new Date(config.validationEnd).getTime();
  const testStartTime = new Date(config.testStart).getTime();
  const testEndTime = config.testEnd ? new Date(config.testEnd).getTime() : Infinity;

  if (trainEndTime > valStartTime) {
    throw new Error('Temporal ordering violation: trainEnd cannot be after validationStart.');
  }
  if (valEndTime > testStartTime) {
    throw new Error('Temporal ordering violation: validationEnd cannot be after testStart.');
  }

  const train: T[] = [];
  const validation: T[] = [];
  const test: T[] = [];

  for (const item of items) {
    const time = new Date(item.applicationTimestamp).getTime();
    if (time <= trainEndTime) {
      train.push(item);
    } else if (time >= valStartTime && time <= valEndTime) {
      validation.push(item);
    } else if (time >= testStartTime && time <= testEndTime) {
      test.push(item);
    }
  }

  const getMinMax = (arr: T[]): { start: string; end: string } => {
    if (arr.length === 0) return { start: 'N/A', end: 'N/A' };
    const timestamps = arr.map((i) => new Date(i.applicationTimestamp).getTime());
    return {
      start: new Date(Math.min(...timestamps)).toISOString(),
      end: new Date(Math.max(...timestamps)).toISOString(),
    };
  };

  return {
    train,
    validation,
    test,
    splitsSummary: {
      trainCount: train.length,
      validationCount: validation.length,
      testCount: test.length,
      trainRange: getMinMax(train),
      validationRange: getMinMax(validation),
      testRange: getMinMax(test),
    },
  };
}

export interface WalkForwardWindow<T> {
  windowIndex: number;
  train: T[];
  test: T[];
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
}

/**
 * Creates rolling / walk-forward evaluation splits for growing time-series datasets.
 */
export function createWalkForwardSplits<T extends { applicationTimestamp: string | Date }>(
  items: T[],
  params: {
    trainWindowDays: number;
    testWindowDays: number;
    stepDays: number;
  },
): WalkForwardWindow<T>[] {
  const { trainWindowDays, testWindowDays, stepDays } = params;
  if (items.length === 0) return [];

  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.applicationTimestamp).getTime() - new Date(b.applicationTimestamp).getTime(),
  );

  const minTime = new Date(sorted[0]!.applicationTimestamp).getTime();
  const maxTime = new Date(sorted[sorted.length - 1]!.applicationTimestamp).getTime();

  const msPerDay = 1000 * 60 * 60 * 24;
  const trainMs = trainWindowDays * msPerDay;
  const testMs = testWindowDays * msPerDay;
  const stepMs = stepDays * msPerDay;

  const windows: WalkForwardWindow<T>[] = [];
  let currentTrainStart = minTime;
  let windowIndex = 0;

  while (currentTrainStart + trainMs + testMs <= maxTime + stepMs) {
    const currentTrainEnd = currentTrainStart + trainMs;
    const currentTestStart = currentTrainEnd;
    const currentTestEnd = currentTestStart + testMs;

    const train = sorted.filter((item) => {
      const t = new Date(item.applicationTimestamp).getTime();
      return t >= currentTrainStart && t < currentTrainEnd;
    });

    const test = sorted.filter((item) => {
      const t = new Date(item.applicationTimestamp).getTime();
      return t >= currentTestStart && t <= currentTestEnd;
    });

    if (train.length > 0 && test.length > 0) {
      windows.push({
        windowIndex,
        train,
        test,
        trainStart: new Date(currentTrainStart).toISOString(),
        trainEnd: new Date(currentTrainEnd).toISOString(),
        testStart: new Date(currentTestStart).toISOString(),
        testEnd: new Date(currentTestEnd).toISOString(),
      });
      windowIndex++;
    }

    currentTrainStart += stepMs;
  }

  return windows;
}
