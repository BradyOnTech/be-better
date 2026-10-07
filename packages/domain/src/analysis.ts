export type AnalysisKind = "activities" | "wellness" | "settings";
export interface AnalysisRefreshState {
  lastAttempt: string;
  lastSuccess: string | null;
  historyFrom: string | null;
  historyTo: string | null;
  records: number;
  restricted: number;
  error: string | null;
}
export interface IntervalsWellness {
  date: string;
  fitness: number | null;
  fatigue: number | null;
  rampRate: number | null;
  fitnessLoad: number | null;
  fatigueLoad: number | null;
  restingHeartRate: number | null;
  hrvRmssd: number | null;
  hrvSdnn: number | null;
  sleepSeconds: number | null;
  sleepScore: number | null;
  soreness: number | null;
  reportedFatigue: number | null;
  stress: number | null;
  mood: number | null;
  injury: number | null;
  readiness: number | null;
  steps: number | null;
  estimatedRestingHeartRate: boolean;
}
export interface IntervalsSportSettings {
  id: string;
  types: string[];
  ftpWatts: number | null;
  indoorFtpWatts: number | null;
  thresholdHeartRate: number | null;
  maxHeartRate: number | null;
  thresholdSpeedMetresPerSecond: number | null;
  heartRateZoneUpperBounds: number[];
  powerZonePercentages: number[];
  paceZonePercentages: number[];
  heartRateZoneNames: string[];
  powerZoneNames: string[];
  paceZoneNames: string[];
}
export interface IntervalsSettings {
  accountId: string;
  timezone: string | null;
  formAsPercent: boolean;
  sports: IntervalsSportSettings[];
  prescriptionStatus: "reference_only";
}
export interface IntervalsActivityAnalysis {
  id: string;
  date: string;
  startTime: string | null;
  type: string | null;
  title: string | null;
  source: string | null;
  restricted: boolean;
  durationSeconds: number | null;
  trainingLoad: number | null;
  powerLoad: number | null;
  heartRateLoad: number | null;
  paceLoad: number | null;
  heartRateLoadMethod: string | null;
  intensityPercent: number | null;
  normalizedPowerWatts: number | null;
  efficiencyFactor: number | null;
  decouplingPercent: number | null;
  heartRateZoneSeconds: number[];
  powerZoneSeconds: number[];
  paceZoneSeconds: number[];
  zoneHeartRateUpperBounds: number[];
  zonePowerPercentages: number[];
  zonePacePercentages: number[];
  ftpWatts: number | null;
  thresholdSpeedMetresPerSecond: number | null;
  detailsFetchedAt: string | null;
  intervals: Array<{
    type: string | null;
    durationSeconds: number | null;
    trainingLoad: number | null;
    averagePowerWatts: number | null;
    averageHeartRate: number | null;
    averageSpeedMetresPerSecond: number | null;
    decouplingPercent: number | null;
  }>;
}
export interface RecoveryTrend {
  latest: number | null;
  latestDate: string | null;
  recentAverage: number | null;
  recentSamples: number;
  baselineAverage: number | null;
  baselineSamples: number;
  changePercent: number | null;
}
export interface IntervalsAnalysis {
  configured: boolean;
  accountId: string | null;
  generatedAt: string;
  refreshing: boolean;
  stale: boolean;
  datasets: Record<AnalysisKind, AnalysisRefreshState | null>;
  settings: IntervalsSettings | null;
  latestWellness: IntervalsWellness | null;
  form: {
    absolute: number;
    percent: number | null;
    displayAsPercent: boolean;
  } | null;
  recovery: {
    hrv: RecoveryTrend;
    restingHeartRate: RecoveryTrend;
    sleep: RecoveryTrend;
  };
  fitnessTrend: Array<{
    date: string;
    fitness: number | null;
    fatigue: number | null;
    rampRate: number | null;
  }>;
  weeks: Array<{
    date: string;
    activities: number;
    knownLoadActivities: number;
    restrictedActivities: number;
    trainingLoad: number | null;
    durationSeconds: number | null;
  }>;
  recentActivities: IntervalsActivityAnalysis[];
  coverage: {
    from: string;
    to: string;
    providerActivities: number;
    linkedConfirmedActivities: number;
    unreviewedProviderActivities: number;
    confirmedWithoutProviderAnalysis: number;
    restrictedActivities: number;
  };
  limitations: string[];
  wellnessRatingScales: {
    sorenessFatigueStress: string;
    mood: string;
    injury: string;
    readiness: string;
  };
}
