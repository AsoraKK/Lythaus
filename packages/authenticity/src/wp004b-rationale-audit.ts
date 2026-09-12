import type { EvidencePacket, PacketEvidence } from './evidence-packet.ts';
import type { JudgeRecommendation } from './judge.ts';
import type { Wp004bLiveEvaluation } from './wp004b-live-calibration.ts';

export const WP004B_RATIONALE_AUDIT_KIND = 'SUPPLEMENTARY' as const;

export type Wp004bRationaleAuditLabel = 'DISCIPLINED' | 'CONCERNING' | 'VIOLATION' | 'NOT_MENTIONED';

export interface Wp004bRationaleAudit {
  auditKind: typeof WP004B_RATIONALE_AUDIT_KIND;
  uniformity?: Wp004bRationaleAuditLabel;
  metadata?: Wp004bRationaleAuditLabel;
  png?: Wp004bRationaleAuditLabel;
  ef2?: Wp004bRationaleAuditLabel;
  ef4?: Wp004bRationaleAuditLabel;
  ef3Unavailable?: Wp004bRationaleAuditLabel;
  ef5Unavailable?: Wp004bRationaleAuditLabel;
  safetyInfluence?: Wp004bRationaleAuditLabel;
  calibratedEf5?: Wp004bRationaleAuditLabel;
  neutralEvidenceUse?: Wp004bRationaleAuditLabel;
}

interface RationaleAuditInput {
  caseId: string;
  packet: EvidencePacket;
  recommendation: JudgeRecommendation;
  evaluation: Wp004bLiveEvaluation | null;
}

function normalizedText(recommendation: JudgeRecommendation): string {
  return [
    recommendation.rationale,
    ...recommendation.alternativeHypotheses.map((item) => item.rationale),
    ...recommendation.supportingEvidence.map((item) => item.rationale),
    ...recommendation.contradictoryEvidence.map((item) => item.rationale),
    ...recommendation.missingEvidence.map((item) => item.request),
  ].join(' ').toLowerCase();
}

function rationaleSegments(text: string): readonly string[] {
  return text.split(/[.!?;\n]+/).map((segment) => segment.trim()).filter(Boolean);
}

function classifyRationaleMention(text: string, subjectPattern: RegExp, violationPattern: RegExp, disciplinedPattern: RegExp): Wp004bRationaleAuditLabel {
  const relevantSegments = rationaleSegments(text).filter((segment) => subjectPattern.test(segment));
  if (relevantSegments.length === 0) return 'NOT_MENTIONED';
  if (relevantSegments.some((segment) => violationPattern.test(segment))) return 'VIOLATION';
  if (relevantSegments.some((segment) => disciplinedPattern.test(segment))) return 'DISCIPLINED';
  return 'CONCERNING';
}

function referencedEvidence(packet: EvidencePacket, recommendation: JudgeRecommendation, predicate: (item: PacketEvidence) => boolean): readonly { evidenceId: string; channel: 'supporting' | 'contradictory' }[] {
  const references = [
    ...recommendation.supportingEvidence.map((reference) => ({ ...reference, channel: 'supporting' as const })),
    ...recommendation.contradictoryEvidence.map((reference) => ({ ...reference, channel: 'contradictory' as const })),
  ];
  return references.filter((reference) => {
    const item = packet.evidence.find((candidate) => candidate.evidenceId === reference.evidenceId);
    return item ? predicate(item) : false;
  }).map(({ evidenceId, channel }) => ({ evidenceId, channel }));
}

function directionAwareLabel(input: RationaleAuditInput, predicate: (item: PacketEvidence) => boolean): Wp004bRationaleAuditLabel | null {
  const references = referencedEvidence(input.packet, input.recommendation, predicate);
  if (references.length === 0 || !input.evaluation) return null;

  const classifications = references.map((reference) => input.evaluation?.epistemic.supportClassification.find((item) => item.evidenceId === reference.evidenceId) ?? null);
  if (classifications.some((classification) => !classification)) return null;

  const directionallyCorrect = references.every((reference, index) => {
    const direction = classifications[index]?.directionByHypothesis[input.recommendation.primaryHypothesis];
    return reference.channel === 'supporting' ? direction === 'SUPPORTS' : direction === 'CONTRADICTS';
  });
  return directionallyCorrect ? 'DISCIPLINED' : 'VIOLATION';
}

export function auditWp004bRationale(input: RationaleAuditInput): Wp004bRationaleAudit {
  const text = normalizedText(input.recommendation);
  const auditKind = WP004B_RATIONALE_AUDIT_KIND;

  if (input.caseId === 'WP004B_LIVE_NEUTRAL_STRESS_01') {
    return {
      auditKind,
      uniformity: classifyRationaleMention(text, /uniform|flat|simple/, /(uniform|flat|simple).{0,100}(support|prove|indicat|suggest).{0,80}(synthetic|camera)/, /neutral|nondiscrimin|not.{0,30}(establish|prove|support)|descriptive|insufficient/),
      metadata: classifyRationaleMention(text, /metadata|exif|xmp/, /(missing|absent).{0,80}(support|prove|indicat|suggest).{0,80}(synthetic|camera)/, /neutral|not.{0,30}(establish|prove|support)|missing evidence|limited/),
      png: classifyRationaleMention(text, /png|file format/, /(png|format).{0,80}(support|prove|indicat|suggest).{0,80}(synthetic|camera)|format.{0,40}proof/, /format.{0,40}(alone|neutral|not)|not.{0,30}(establish|prove|support)/),
      ef2: directionAwareLabel(input, (item) => item.family === 'EF2_PHYSICAL_ACQUISITION') ?? classifyRationaleMention(text, /ef2|camera.{0,20}(proxy|evidence)|sensor noise|camera pipeline/, /(prove|support|therefore|more likely).{0,100}(camera[-_ ]native|synthetic)/, /uncalibrated|proxy|not.{0,30}(proof|support)|neutral|experimental|directional evidence/),
      ef4: directionAwareLabel(input, (item) => item.family === 'EF4_SPECTRAL_STABILITY') ?? classifyRationaleMention(text, /ef4|spectral|variance|residual/, /(prove|support|therefore|more likely).{0,100}(camera[-_ ]native|synthetic)/, /uncalibrated|not.{0,30}(proof|support)|neutral|experimental|directional evidence/),
      ef3Unavailable: classifyRationaleMention(text, /ef3|generative/, /(unavailable|missing).{0,80}(no|none|not).{0,80}(generative|artifact)/, /unavailable|missing|not.{0,30}(run|available)|no conclusion/),
      ef5Unavailable: classifyRationaleMention(text, /ef5|local manipulation|reconstruction/, /(unavailable|missing).{0,80}(no|none|not).{0,80}(manipulation|edit)/, /unavailable|missing|not.{0,30}(run|available)|no conclusion/),
    };
  }

  if (input.caseId === 'WP004B_LIVE_SAFETY_BLOCK_01') {
    return {
      auditKind,
      safetyInfluence: classifyRationaleMention(text, /safety|moderation|block|violence/, /(safety|moderation|block|violence).{0,160}(support|contradict|prove|therefore|more likely).{0,100}(synthetic|camera|origin|manipulat)/, /safety.{0,80}(context only|separate|excluded)|not.{0,40}(authenticity|origin)|must not/),
    };
  }

  return {
    auditKind,
    calibratedEf5: directionAwareLabel(input, (item) => item.family === 'EF5_RECONSTRUCTION_LOCAL_MANIPULATION' && item.name === 'calibrated_local_edit') ?? classifyRationaleMention(text, /calibrated|ef5|local edit|localized alteration|reconstruction/, /(ef5|calibrated|local edit).{0,120}(support|indicat|establish).{0,80}(local|manipulat)/, /calibrated|directional|localized alteration|supports/),
    neutralEvidenceUse: directionAwareLabel(input, (item) => item.family === 'EF1_FILE_PROVENANCE') ?? classifyRationaleMention(text, /png|file format|metadata|exif/, /(png|format|metadata|exif).{0,100}(support|prove|therefore).{0,80}(origin|synthetic|camera)/, /neutral|not.{0,30}(proof|support|establish)/),
  };
}
