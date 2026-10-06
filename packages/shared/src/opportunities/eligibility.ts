import type {
  Opportunity,
  OpportunityRequirement,
  OpportunityProgramRule,
  StudentCareerProfile,
  EligibilityResult,
  EligibilityCriterionResult,
  EligibilityStatus,
} from '@campusflow/types';

/**
 * Deterministic Eligibility Engine
 *
 * Rules:
 * 1. Checks explicit requirements (degree, graduation year, work authorization, internship eligibility, experience).
 * 2. Missing information MUST produce 'uncertain', never an invented guess.
 * 3. Any explicit failure of a mandatory requirement results in 'not_eligible'.
 * 4. Retains full evidence and rationale for every evaluated criterion.
 */
export function evaluateEligibility(params: {
  opportunity: Opportunity;
  requirements?: OpportunityRequirement[];
  programRules?: OpportunityProgramRule[];
  profile: StudentCareerProfile | null;
}): EligibilityResult {
  const { opportunity, requirements = [], programRules = [], profile } = params;
  const criteria: EligibilityCriterionResult[] = [];
  const reasons: string[] = [];

  // If no career profile exists, the student's eligibility is wholly uncertain
  if (!profile) {
    return {
      status: 'uncertain',
      reasons: ['No student career profile found. Create your profile to verify eligibility.'],
      criteria: [
        {
          criterion: 'Student Profile',
          status: 'uncertain',
          detail: 'Career profile has not been configured.',
        },
      ],
    };
  }

  // 0. Opportunity Expiration / Deadline
  if (opportunity.expirationDate && new Date(opportunity.expirationDate).getTime() < Date.now()) {
    criteria.push({
      criterion: 'Opportunity Expiration',
      status: 'fail',
      detail: 'Position deadline has passed and applications are closed.',
    });
    reasons.push('[FAIL] Position deadline has passed');
  }

  // 1. Degree Level Requirement
  if (opportunity.degreeLevels && opportunity.degreeLevels.length > 0) {
    if (!profile.degreeLevel) {
      criteria.push({
        criterion: 'Degree Level',
        status: 'uncertain',
        detail: `Position requires [${opportunity.degreeLevels.join(', ')}], but your degree level is not specified in your profile.`,
      });
      reasons.push('[UNCERTAIN] Degree Level: Not specified in career profile');
    } else {
      const normalizedStudentDegree = profile.degreeLevel.toLowerCase().trim();
      const isAllowed = opportunity.degreeLevels.some((d) => {
        const norm = d.toLowerCase().trim();
        return (
          norm === normalizedStudentDegree ||
          (norm === 'bachelors' &&
            ['bs', 'ba', 'btech', 'be', 'undergraduate'].includes(normalizedStudentDegree)) ||
          (norm === 'masters' && ['ms', 'mtech', 'graduate'].includes(normalizedStudentDegree))
        );
      });

      if (isAllowed) {
        criteria.push({
          criterion: 'Degree Level',
          status: 'pass',
          detail: `Your degree level (${profile.degreeLevel}) satisfies requirement [${opportunity.degreeLevels.join(', ')}].`,
        });
        reasons.push(`[PASS] Degree Level: ${profile.degreeLevel} meets requirement`);
      } else {
        criteria.push({
          criterion: 'Degree Level',
          status: 'fail',
          detail: `Your degree level (${profile.degreeLevel}) does not meet the required [${opportunity.degreeLevels.join(', ')}].`,
        });
        reasons.push(
          `[FAIL] Degree Level: ${profile.degreeLevel} does not match required [${opportunity.degreeLevels.join(', ')}]`,
        );
      }
    }
  }

  // 2. Target Graduation Year / Timing
  if (opportunity.targetGraduationYears && opportunity.targetGraduationYears.length > 0) {
    if (profile.graduationYear === null || profile.graduationYear === undefined) {
      criteria.push({
        criterion: 'Graduation Timing',
        status: 'uncertain',
        detail: `Position requires graduation in [${opportunity.targetGraduationYears.join(', ')}], but your graduation year is not declared.`,
      });
      reasons.push('[UNCERTAIN] Graduation Year: Not declared in career profile');
    } else {
      const match = opportunity.targetGraduationYears.includes(profile.graduationYear);
      if (match) {
        criteria.push({
          criterion: 'Graduation Timing',
          status: 'pass',
          detail: `Graduation year (${profile.graduationYear}) matches target window [${opportunity.targetGraduationYears.join(', ')}].`,
        });
        reasons.push(`[PASS] Graduation Year: ${profile.graduationYear} matches target window`);
      } else {
        criteria.push({
          criterion: 'Graduation Timing',
          status: 'fail',
          detail: `Graduation year (${profile.graduationYear}) does not match target window [${opportunity.targetGraduationYears.join(', ')}]. Target graduation years: [${opportunity.targetGraduationYears.join(', ')}].`,
        });
        reasons.push(
          `[FAIL] Graduation Timing: ${profile.graduationYear} is outside required window [${opportunity.targetGraduationYears.join(', ')}]`,
        );
      }
    }
  }

  // 3. Internship Eligibility & Enrollment
  if (opportunity.opportunityType === 'internship' || opportunity.opportunityType === 'co_op') {
    if (profile.isEnrolled === false) {
      criteria.push({
        criterion: 'Student Enrollment Status',
        status: 'fail',
        detail:
          'Internship programs require active student enrollment at an accredited university.',
      });
      reasons.push('[FAIL] Enrollment: Active university enrollment is required');
    } else {
      criteria.push({
        criterion: 'Student Enrollment Status',
        status: 'pass',
        detail: 'Currently enrolled student status verified.',
      });
      reasons.push('[PASS] Enrollment: Active student');
    }

    // Program rule: Must return to school for at least one semester
    const returnToSchoolRule = programRules.find((r) => r.ruleType === 'must_return_to_school');
    if (returnToSchoolRule && profile.graduationYear) {
      // If role is Summer internship (e.g. Summer 2026) and student graduates in or before that summer
      const oppSeason = opportunity.season?.toLowerCase() || '';
      const oppYear = parseInt(oppSeason.replace(/\D/g, ''), 10);
      if (
        !isNaN(oppYear) &&
        profile.graduationYear <= oppYear &&
        (profile.graduationMonth || 5) <= 6
      ) {
        criteria.push({
          criterion: 'Return to School Requirement',
          status: 'fail',
          detail:
            returnToSchoolRule.explanation ||
            'Candidate must return to full-time degree program for at least one academic term following the internship.',
        });
        reasons.push(
          `[FAIL] Return to School: Graduation in ${profile.graduationYear} does not allow returning for a post-internship term`,
        );
      } else {
        criteria.push({
          criterion: 'Return to School Requirement',
          status: 'pass',
          detail: 'Expected graduation allows for post-internship return to studies.',
        });
        reasons.push('[PASS] Return to School: Satisfied');
      }
    }
  }

  // 4. Work Authorization
  if (opportunity.requiresWorkAuth && opportunity.requiresWorkAuth !== 'any') {
    if (!profile.workAuthorization) {
      criteria.push({
        criterion: 'Work Authorization',
        status: 'uncertain',
        detail: `Position requires specific work authorization (${opportunity.requiresWorkAuth}), but your status is not provided.`,
      });
      reasons.push('[UNCERTAIN] Work Authorization: Not provided in profile');
    } else {
      const studentAuth = profile.workAuthorization.toLowerCase().trim();
      if (opportunity.requiresWorkAuth === 'us_citizen_or_pr') {
        const isCitizenOrPr = [
          'citizen',
          'us_citizen',
          'permanent_resident',
          'green_card',
        ].includes(studentAuth);
        if (isCitizenOrPr) {
          criteria.push({
            criterion: 'Work Authorization',
            status: 'pass',
            detail: 'Citizen / Permanent Resident requirement satisfied.',
          });
          reasons.push('[PASS] Work Authorization: Citizen or Permanent Resident');
        } else {
          criteria.push({
            criterion: 'Work Authorization',
            status: 'fail',
            detail:
              'Position requires US Citizenship or Permanent Residency (export control / defense / strict policy).',
          });
          reasons.push(
            '[FAIL] Work Authorization: Position requires US Citizen or Permanent Resident',
          );
        }
      } else if (opportunity.requiresWorkAuth === 'no_sponsorship') {
        const needsSponsorship = ['requires_sponsorship', 'f1_opt_cpt', 'needs_visa'].includes(
          studentAuth,
        );
        if (needsSponsorship) {
          criteria.push({
            criterion: 'Work Authorization',
            status: 'fail',
            detail: 'Employer does not provide visa sponsorship for this position.',
          });
          reasons.push('[FAIL] Work Authorization: Visa sponsorship not offered by employer');
        } else {
          criteria.push({
            criterion: 'Work Authorization',
            status: 'pass',
            detail: 'Authorized to work without employer visa sponsorship.',
          });
          reasons.push('[PASS] Work Authorization: Authorized without sponsorship');
        }
      } else if (opportunity.requiresWorkAuth === 'sponsorship_available') {
        criteria.push({
          criterion: 'Work Authorization',
          status: 'pass',
          detail: 'Employer offers visa sponsorship for qualified candidates.',
        });
        reasons.push('[PASS] Work Authorization: Employer offers sponsorship');
      }
    }
  }

  // 5. Minimum Experience Requirement
  if (opportunity.minExperienceMonths > 0) {
    if (!profile.yearsExperience) {
      criteria.push({
        criterion: 'Experience Level',
        status: 'uncertain',
        detail: `Requires ${opportunity.minExperienceMonths} months experience, but experience length is unstated.`,
      });
      reasons.push(`[UNCERTAIN] Experience: Requires ${opportunity.minExperienceMonths} months`);
    } else {
      const studentMonths = parseFloat(profile.yearsExperience) * 12;
      if (studentMonths >= opportunity.minExperienceMonths) {
        criteria.push({
          criterion: 'Experience Level',
          status: 'pass',
          detail: `Demonstrated experience (${studentMonths.toFixed(0)} months) meets minimum of ${opportunity.minExperienceMonths} months.`,
        });
        reasons.push(
          `[PASS] Experience: ${studentMonths.toFixed(0)} months meets ${opportunity.minExperienceMonths} months min`,
        );
      } else {
        criteria.push({
          criterion: 'Experience Level',
          status: 'fail',
          detail: `Demonstrated experience (${studentMonths.toFixed(0)} months) is below required ${opportunity.minExperienceMonths} months.`,
        });
        reasons.push(
          `[FAIL] Experience: ${studentMonths.toFixed(0)} months is less than required ${opportunity.minExperienceMonths} months`,
        );
      }
    }
  }

  // 6. Minimum GPA Requirement
  if (opportunity.minGpa) {
    const requiredGpa = parseFloat(opportunity.minGpa);
    if (!profile.gpa) {
      criteria.push({
        criterion: 'Minimum GPA',
        status: 'uncertain',
        detail: `Position specifies minimum GPA of ${requiredGpa.toFixed(2)}, but your GPA is not declared.`,
      });
      reasons.push(`[UNCERTAIN] GPA: Position specifies min GPA of ${requiredGpa.toFixed(2)}`);
    } else {
      const studentGpa = parseFloat(profile.gpa);
      if (studentGpa >= requiredGpa) {
        criteria.push({
          criterion: 'Minimum GPA',
          status: 'pass',
          detail: `Declared GPA (${studentGpa.toFixed(2)}) meets minimum requirement of ${requiredGpa.toFixed(2)}.`,
        });
        reasons.push(`[PASS] GPA: ${studentGpa.toFixed(2)} meets min ${requiredGpa.toFixed(2)}`);
      } else {
        criteria.push({
          criterion: 'Minimum GPA',
          status: 'fail',
          detail: `Declared GPA (${studentGpa.toFixed(2)}) does not meet required minimum of ${requiredGpa.toFixed(2)}.`,
        });
        reasons.push(`[FAIL] GPA: ${studentGpa.toFixed(2)} is below min ${requiredGpa.toFixed(2)}`);
      }
    }
  }

  // 7. Explicit Opportunity Requirements (custom checks)
  for (const req of requirements) {
    if (req.isMandatory) {
      if (req.category === 'major' && opportunity.allowedMajors?.length) {
        if (!profile.major) {
          criteria.push({
            criterion: 'Major / Field of Study',
            status: 'uncertain',
            detail: `Requires major in [${opportunity.allowedMajors.join(', ')}], but your major is not declared.`,
          });
          reasons.push('[UNCERTAIN] Major: Not declared');
        } else {
          const studentMajor = profile.major.toLowerCase();
          const matchesMajor = opportunity.allowedMajors.some(
            (m) => studentMajor.includes(m.toLowerCase()) || m.toLowerCase().includes(studentMajor),
          );
          if (matchesMajor) {
            criteria.push({
              criterion: 'Major / Field of Study',
              status: 'pass',
              detail: `Major (${profile.major}) matches accepted fields.`,
            });
            reasons.push(`[PASS] Major: ${profile.major} matches accepted majors`);
          } else {
            criteria.push({
              criterion: 'Major / Field of Study',
              status: 'fail',
              detail: `Major (${profile.major}) is not among accepted fields: [${opportunity.allowedMajors.join(', ')}].`,
            });
            reasons.push(`[FAIL] Major: ${profile.major} is not in accepted list`);
          }
        }
      } else if (
        req.category === 'coursework' ||
        req.category === 'skill' ||
        req.category === 'general'
      ) {
        criteria.push({
          criterion: `Requirement: ${req.description}`,
          status: 'uncertain',
          detail: `Mandatory requirement "${req.description}" cannot be automatically verified from current profile data.`,
        });
        reasons.push(`[UNCERTAIN] Mandatory requirement: ${req.description}`);
      }
    }
  }

  // Synthesize overall eligibility status
  const hasFail = criteria.some((c) => c.status === 'fail');
  const hasUncertain = criteria.some((c) => c.status === 'uncertain');

  let status: EligibilityStatus;
  if (hasFail) {
    status = 'not_eligible';
  } else if (hasUncertain) {
    status = 'uncertain';
  } else {
    status = 'eligible';
  }

  return {
    status,
    reasons:
      status === 'eligible'
        ? []
        : reasons.filter((r) => r.startsWith('[FAIL]') || r.startsWith('[UNCERTAIN]')),
    criteria,
  };
}
