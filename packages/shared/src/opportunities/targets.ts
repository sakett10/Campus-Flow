import type { OutcomeTarget, OutcomeDefinition } from '@campusflow/types';

/**
 * Standard modeling outcome target definitions.
 *
 * CRITICAL RULE:
 * Missing outcomes must NEVER be treated as rejections.
 * If an application has no terminal status recorded within the observation window,
 * it is treated as censored (or excluded from supervised training of that stage).
 */
export const OUTCOME_DEFINITIONS: Record<OutcomeTarget, OutcomeDefinition> = {
  application_to_assessment: {
    target: 'application_to_assessment',
    startStage: 'applied',
    successStage: 'assessment',
    observationWindowDays: 30,
    censoringRules: [
      'Application withdrawn before assessment sent',
      'No response within 30 days of application timestamp',
      'Company unverified or posting expired within 7 days of application',
    ],
    missingOutcomeBehavior: 'treat_as_censored',
    description:
      'Probability of transitioning from submitted application to receiving an initial technical or screening assessment.',
  },

  assessment_to_interview: {
    target: 'assessment_to_interview',
    startStage: 'assessment',
    successStage: 'interview',
    observationWindowDays: 45,
    censoringRules: [
      'Candidate declined assessment invitation',
      'No response within 45 days after completing assessment',
    ],
    missingOutcomeBehavior: 'treat_as_censored',
    description:
      'Probability of transitioning from assessment completion to invitation for a first-round interview.',
  },

  interview_to_final: {
    target: 'interview_to_final',
    startStage: 'interview',
    successStage: 'final_interview',
    observationWindowDays: 45,
    censoringRules: [
      'Candidate accepted another offer and withdrew',
      'No response within 45 days of initial interview',
    ],
    missingOutcomeBehavior: 'treat_as_censored',
    description: 'Probability of progressing from first-round interview to final-round interview.',
  },

  final_to_offer: {
    target: 'final_to_offer',
    startStage: 'final_interview',
    successStage: 'offer',
    observationWindowDays: 30,
    censoringRules: [
      'Candidate withdrew before decision rendered',
      'No decision rendered within 30 days after final interview',
    ],
    missingOutcomeBehavior: 'treat_as_censored',
    description: 'Probability of receiving a formal offer after completing final round interviews.',
  },

  application_to_offer: {
    target: 'application_to_offer',
    startStage: 'applied',
    successStage: 'offer',
    observationWindowDays: 120,
    censoringRules: [
      'Candidate withdrew application prior to offer or rejection',
      'In progress but observation window (120 days) has not yet elapsed',
      'No terminal response after 120 days (right-censored)',
    ],
    missingOutcomeBehavior: 'treat_as_censored',
    description:
      'End-to-end probability of progressing from application submission to a formal offer.',
  },
};

export const TARGET_DEFINITIONS = OUTCOME_DEFINITIONS;

export interface TargetOutcomeEvaluation {
  target: OutcomeTarget;
  targetLabel: 0 | 1 | null; // 1 for success, 0 for failure, null for censored/excluded
  isSuccess?: boolean | undefined;
  isCensored: boolean;
  outcomeHorizonDays: number;
  reason: string;
}

export interface ApplicationLifecycleData {
  appliedAt: Date | string;
  assessmentAt?: Date | string | null | undefined;
  interviewAt?: Date | string | null | undefined;
  finalInterviewAt?: Date | string | null | undefined;
  outcomeAt?: Date | string | null | undefined;
  status: string; // 'applied' | 'assessment' | 'interview' | 'final_interview' | 'offer' | 'rejected' | 'withdrawn'
  evaluationReferenceDate?: Date | string | undefined;
}

/**
 * Evaluates whether an application record satisfies a target definition.
 * Strictly enforces that missing outcomes are marked as censored (null targetLabel), NEVER as rejection (0).
 */
export function evaluateTargetOutcome(
  targetOrDef: OutcomeTarget | OutcomeDefinition,
  appOrDate: ApplicationLifecycleData | string | Date,
  statusArg?: string | null,
  outcomeAtArg?: string | Date | null,
): TargetOutcomeEvaluation {
  const target: OutcomeTarget = typeof targetOrDef === 'string' ? targetOrDef : targetOrDef.target;
  const def = OUTCOME_DEFINITIONS[target];

  let app: ApplicationLifecycleData;
  if (typeof appOrDate === 'string' || appOrDate instanceof Date) {
    let normalizedStatus = statusArg ?? 'in_progress';
    if (normalizedStatus === 'offer_received') normalizedStatus = 'offer';
    if (normalizedStatus === 'assessment_received') normalizedStatus = 'assessment';
    app = {
      appliedAt: appOrDate,
      status: normalizedStatus,
      outcomeAt: outcomeAtArg,
      assessmentAt: normalizedStatus === 'assessment' ? outcomeAtArg : undefined,
    };
  } else {
    app = appOrDate;
  }

  const appliedDate = new Date(app.appliedAt);
  const now = app.evaluationReferenceDate ? new Date(app.evaluationReferenceDate) : new Date();

  // If application was withdrawn, it is censored across all targets
  if (app.status === 'withdrawn') {
    const horizon = Math.max(
      0,
      Math.round((now.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)),
    );
    return {
      target,
      targetLabel: null,
      isSuccess: false,
      isCensored: true,
      outcomeHorizonDays: horizon,
      reason: 'Candidate withdrew application; outcome is right-censored.',
    };
  }

  switch (target) {
    case 'application_to_offer': {
      if (app.status === 'offer') {
        const outcomeDate = app.outcomeAt ? new Date(app.outcomeAt) : now;
        const horizon = Math.max(
          1,
          Math.round((outcomeDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        if (horizon > def.observationWindowDays) {
          return {
            target,
            targetLabel: null,
            isSuccess: false,
            isCensored: true,
            outcomeHorizonDays: horizon,
            reason: `Event occurred at ${horizon} days, exceeding observation window of ${def.observationWindowDays} days. Right-censored.`,
          };
        }
        return {
          target,
          targetLabel: 1,
          isSuccess: true,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Offer received within observation window.',
        };
      }

      if (app.status === 'rejected') {
        const outcomeDate = app.outcomeAt ? new Date(app.outcomeAt) : now;
        const horizon = Math.max(
          1,
          Math.round((outcomeDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 0,
          isSuccess: false,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Application rejected.',
        };
      }

      // Application is in-progress or missing explicit outcome
      const elapsedDays = Math.round(
        (now.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      // If still within observation window: censored (in progress)
      // If beyond observation window without terminal outcome: censored (no response, NOT rejection)
      return {
        target,
        targetLabel: null,
        isSuccess: false,
        isCensored: true,
        outcomeHorizonDays: elapsedDays,
        reason:
          elapsedDays <= def.observationWindowDays
            ? `In progress (${elapsedDays} days elapsed, window ${def.observationWindowDays}d).`
            : `Missing outcome after ${elapsedDays} days. Right-censored (NOT treated as rejection).`,
      };
    }

    case 'application_to_assessment': {
      if (
        app.assessmentAt ||
        ['assessment', 'interview', 'final_interview', 'offer'].includes(app.status)
      ) {
        const assessmentDate = app.assessmentAt ? new Date(app.assessmentAt) : now;
        const horizon = Math.max(
          1,
          Math.round((assessmentDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        if (horizon > def.observationWindowDays) {
          return {
            target,
            targetLabel: null,
            isSuccess: false,
            isCensored: true,
            outcomeHorizonDays: horizon,
            reason: `Assessment event occurred at ${horizon} days, exceeding observation window of ${def.observationWindowDays} days. Right-censored.`,
          };
        }
        return {
          target,
          targetLabel: 1,
          isSuccess: true,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Assessment invitation received.',
        };
      }

      if (app.status === 'rejected' && !app.assessmentAt) {
        const outcomeDate = app.outcomeAt ? new Date(app.outcomeAt) : now;
        const horizon = Math.max(
          1,
          Math.round((outcomeDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 0,
          isSuccess: false,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Rejected before assessment stage.',
        };
      }

      const elapsedDays = Math.round(
        (now.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        target,
        targetLabel: null,
        isSuccess: false,
        isCensored: true,
        outcomeHorizonDays: elapsedDays,
        reason: `Pending assessment outcome (${elapsedDays} days elapsed). Censored.`,
      };
    }

    case 'assessment_to_interview': {
      if (!app.assessmentAt && app.status === 'applied') {
        // Not eligible for this transition
        return {
          target,
          targetLabel: null,
          isCensored: true,
          outcomeHorizonDays: 0,
          reason: 'Candidate has not reached assessment stage.',
        };
      }

      const assessDate = app.assessmentAt ? new Date(app.assessmentAt) : appliedDate;

      if (app.interviewAt || ['interview', 'final_interview', 'offer'].includes(app.status)) {
        const interviewDate = app.interviewAt ? new Date(app.interviewAt) : now;
        const horizon = Math.max(
          1,
          Math.round((interviewDate.getTime() - assessDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 1,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Interview invitation received following assessment.',
        };
      }

      if (app.status === 'rejected') {
        const outcomeDate = app.outcomeAt ? new Date(app.outcomeAt) : now;
        const horizon = Math.max(
          1,
          Math.round((outcomeDate.getTime() - assessDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 0,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Rejected following assessment stage.',
        };
      }

      const elapsedDays = Math.round(
        (now.getTime() - assessDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        target,
        targetLabel: null,
        isCensored: true,
        outcomeHorizonDays: elapsedDays,
        reason: `Assessment completed; awaiting interview decision. Censored.`,
      };
    }

    case 'interview_to_final': {
      if (!app.interviewAt && !['interview', 'final_interview', 'offer'].includes(app.status)) {
        return {
          target,
          targetLabel: null,
          isCensored: true,
          outcomeHorizonDays: 0,
          reason: 'Candidate has not reached initial interview stage.',
        };
      }

      const interviewDate = app.interviewAt ? new Date(app.interviewAt) : appliedDate;

      if (app.finalInterviewAt || ['final_interview', 'offer'].includes(app.status)) {
        const finalDate = app.finalInterviewAt ? new Date(app.finalInterviewAt) : now;
        const horizon = Math.max(
          1,
          Math.round((finalDate.getTime() - interviewDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 1,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Advanced to final round interview.',
        };
      }

      if (app.status === 'rejected') {
        const outcomeDate = app.outcomeAt ? new Date(app.outcomeAt) : now;
        const horizon = Math.max(
          1,
          Math.round((outcomeDate.getTime() - interviewDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 0,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Rejected following interview stage.',
        };
      }

      const elapsedDays = Math.round(
        (now.getTime() - interviewDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        target,
        targetLabel: null,
        isCensored: true,
        outcomeHorizonDays: elapsedDays,
        reason: 'Awaiting decision after initial interview. Censored.',
      };
    }

    case 'final_to_offer': {
      if (!app.finalInterviewAt && !['final_interview', 'offer'].includes(app.status)) {
        return {
          target,
          targetLabel: null,
          isCensored: true,
          outcomeHorizonDays: 0,
          reason: 'Candidate has not reached final interview stage.',
        };
      }

      const finalDate = app.finalInterviewAt ? new Date(app.finalInterviewAt) : appliedDate;

      if (app.status === 'offer') {
        const outcomeDate = app.outcomeAt ? new Date(app.outcomeAt) : now;
        const horizon = Math.max(
          1,
          Math.round((outcomeDate.getTime() - finalDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 1,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Offer extended following final round interview.',
        };
      }

      if (app.status === 'rejected') {
        const outcomeDate = app.outcomeAt ? new Date(app.outcomeAt) : now;
        const horizon = Math.max(
          1,
          Math.round((outcomeDate.getTime() - finalDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          target,
          targetLabel: 0,
          isCensored: false,
          outcomeHorizonDays: horizon,
          reason: 'Rejected following final interview stage.',
        };
      }

      const elapsedDays = Math.round((now.getTime() - finalDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        target,
        targetLabel: null,
        isCensored: true,
        outcomeHorizonDays: elapsedDays,
        reason: 'Awaiting final offer decision. Censored.',
      };
    }
  }
}
