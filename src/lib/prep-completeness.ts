import type {
  CandidateEventsFile,
  Confidence,
  Direction,
  BoundaryAssumption,
  LoadedFile,
} from '../schema/types.js';

export interface PrepStatus {
  eventCount: number;
  assumptionCount: number;
  confidenceBreakdown: Record<Confidence, number>;
  assumptionConfidenceBreakdown: Record<Confidence, number>;
  directionBreakdown: Record<Direction, number>;
  aggregateCoverage: string[];
  unresolvedAssumptions: BoundaryAssumption[];
  completenessScore: number;
  gaps: string[];
}

export interface SessionPrepStatus {
  participantCount: number;
  fileCount: number;
  perFile: Array<{ filename: string; role: string; status: PrepStatus }>;
  totalEvents: number;
  totalAssumptions: number;
  overallScore: number;
  aggregateCoverage: string[];
  sessionGaps: string[];
}

const ALL_CONFIDENCES: Confidence[] = ['CONFIRMED', 'LIKELY', 'POSSIBLE'];
const ALL_DIRECTIONS: Direction[] = ['inbound', 'outbound', 'internal'];

function emptyConfidenceBreakdown(): Record<Confidence, number> {
  return { CONFIRMED: 0, LIKELY: 0, POSSIBLE: 0 };
}

function emptyDirectionBreakdown(): Record<Direction, number> {
  return { inbound: 0, outbound: 0, internal: 0 };
}

function computeCompletenessScore(
  file: CandidateEventsFile,
  eventCount: number,
  assumptionCount: number,
  directionBreakdown: Record<Direction, number>,
  aggregateCoverage: string[],
  confidenceBreakdown: Record<Confidence, number>
): number {
  let score = 0;

  // +30 if eventCount >= 5; +15 if 1-4; +0 if 0
  if (eventCount >= 5) {
    score += 30;
  } else if (eventCount >= 1) {
    score += 15;
  }

  // +20 if at least 1 assumption; +10 more if >= 3
  if (assumptionCount >= 1) {
    score += 20;
    if (assumptionCount >= 3) {
      score += 10;
    }
  }

  // +20 if all 3 directions represented
  const directionsPresent = ALL_DIRECTIONS.filter((d) => directionBreakdown[d] > 0).length;
  if (directionsPresent === 3) {
    score += 20;
  }

  // +10 if at least 2 aggregates referenced
  if (aggregateCoverage.length >= 2) {
    score += 10;
  }

  // +10 if >= 50% of events are CONFIRMED or LIKELY
  if (eventCount > 0) {
    const highConfidence = confidenceBreakdown['CONFIRMED'] + confidenceBreakdown['LIKELY'];
    if (highConfidence / eventCount >= 0.5) {
      score += 10;
    }
  }

  // +10 if metadata fields (role, scope, goal) are non-empty strings
  const meta = file.metadata;
  if (
    typeof meta.role === 'string' && meta.role.trim() !== '' &&
    typeof meta.scope === 'string' && meta.scope.trim() !== '' &&
    typeof meta.goal === 'string' && meta.goal.trim() !== ''
  ) {
    score += 10;
  }

  return score;
}

function detectGaps(
  eventCount: number,
  assumptionCount: number,
  directionBreakdown: Record<Direction, number>,
  aggregateCoverage: string[],
  confidenceBreakdown: Record<Confidence, number>
): string[] {
  const gaps: string[] = [];

  if (eventCount === 0) {
    gaps.push('No domain events defined');
  }

  if (assumptionCount === 0) {
    gaps.push('No boundary assumptions defined');
  }

  for (const direction of ALL_DIRECTIONS) {
    if (directionBreakdown[direction] === 0) {
      const label = direction.charAt(0).toUpperCase() + direction.slice(1);
      gaps.push(`Missing ${direction} events`);
    }
  }

  if (aggregateCoverage.length === 1) {
    gaps.push('Only one aggregate referenced — consider broader scope');
  }

  if (eventCount > 0) {
    const possibleCount = confidenceBreakdown['POSSIBLE'];
    if (possibleCount / eventCount > 0.5) {
      gaps.push('High proportion of POSSIBLE confidence events (>50%)');
    }
  }

  return gaps;
}

export function computePrepStatus(file: CandidateEventsFile): PrepStatus {
  const eventCount = file.domain_events.length;
  const assumptionCount = file.boundary_assumptions.length;

  const confidenceBreakdown = emptyConfidenceBreakdown();
  const directionBreakdown = emptyDirectionBreakdown();
  const aggregateSet = new Set<string>();

  for (const event of file.domain_events) {
    confidenceBreakdown[event.confidence] += 1;
    directionBreakdown[event.integration.direction] += 1;
    aggregateSet.add(event.aggregate);
  }

  const assumptionConfidenceBreakdown = emptyConfidenceBreakdown();
  const unresolvedAssumptions: BoundaryAssumption[] = [];

  for (const assumption of file.boundary_assumptions) {
    assumptionConfidenceBreakdown[assumption.confidence] += 1;
    if (assumption.confidence !== 'CONFIRMED') {
      unresolvedAssumptions.push(assumption);
    }
  }

  const aggregateCoverage = [...aggregateSet];

  const completenessScore = computeCompletenessScore(
    file,
    eventCount,
    assumptionCount,
    directionBreakdown,
    aggregateCoverage,
    confidenceBreakdown
  );

  const gaps = detectGaps(
    eventCount,
    assumptionCount,
    directionBreakdown,
    aggregateCoverage,
    confidenceBreakdown
  );

  return {
    eventCount,
    assumptionCount,
    confidenceBreakdown,
    assumptionConfidenceBreakdown,
    directionBreakdown,
    aggregateCoverage,
    unresolvedAssumptions,
    completenessScore,
    gaps,
  };
}

export function computeSessionStatus(files: LoadedFile[]): SessionPrepStatus {
  const perFile = files.map((f) => ({
    filename: f.filename,
    role: f.role,
    status: computePrepStatus(f.data),
  }));

  const fileCount = files.length;
  const participantCount = fileCount;

  const totalEvents = perFile.reduce((sum, f) => sum + f.status.eventCount, 0);
  const totalAssumptions = perFile.reduce((sum, f) => sum + f.status.assumptionCount, 0);

  const overallScore =
    fileCount === 0
      ? 0
      : Math.round(perFile.reduce((sum, f) => sum + f.status.completenessScore, 0) / fileCount);

  const aggregateUnion = new Set<string>();
  for (const f of perFile) {
    for (const agg of f.status.aggregateCoverage) {
      aggregateUnion.add(agg);
    }
  }
  const aggregateCoverage = [...aggregateUnion];

  const sessionGaps: string[] = [];

  if (fileCount < 2) {
    sessionGaps.push('Only 1 participant has submitted');
  }

  // Check for missing directions across all files
  const sessionDirections = emptyDirectionBreakdown();
  for (const f of perFile) {
    for (const dir of ALL_DIRECTIONS) {
      sessionDirections[dir] += f.status.directionBreakdown[dir];
    }
  }
  for (const direction of ALL_DIRECTIONS) {
    if (sessionDirections[direction] === 0) {
      sessionGaps.push(`No ${direction} events across any file`);
    }
  }

  return {
    participantCount,
    fileCount,
    perFile,
    totalEvents,
    totalAssumptions,
    overallScore,
    aggregateCoverage,
    sessionGaps,
  };
}
