# WP006A Specialist Interface

`lythaus-wp006a-specialist-feasibility-v1` is a research-only measurement
contract. It is deliberately narrower than an Evidence Packet and cannot
assign an origin hypothesis.

## Contract

The TypeScript contract is [`packages/authenticity/src/wp006a.ts`](../../packages/authenticity/src/wp006a.ts).

```ts
interface Wp006aSpecialistResult {
  schemaVersion: "lythaus-wp006a-specialist-feasibility-v1";
  specialistId: string;
  version: string;
  evidenceFamily:
    | "EF2_PHYSICAL_ACQUISITION"
    | "EF3_GENERATIVE_FORENSICS"
    | "EF5_RECONSTRUCTION_LOCAL_MANIPULATION";
  measurementType: string;
  rawScore?: number | null;
  normalizedMeasurement?: number | null;
  region?: {
    coordinateSpace: "NORMALIZED" | "PIXEL";
    x: number;
    y: number;
    width: number;
    height: number;
    maskReference?: string | null;
  } | null;
  applicability: "applicable" | "not_applicable" | "unavailable" | "invalid";
  runtimeMs: number;
  limitations: string[];
  calibrationStatus:
    | "UNVALIDATED"
    | "MEASUREMENT_ONLY"
    | "CALIBRATION_CANDIDATE"
    | "DIRECTIONALLY_VALIDATED";
  provenance?: {
    inputHash: string;
    repositoryCommit?: string | null;
    checkpointHash?: string | null;
    dependencyLockHash?: string | null;
    preprocessing?: string | null;
  } | null;
}
```

The contract intentionally has no `supports`, `contradicts`, `origin`,
`recommendation`, `authenticityVerdict`, or `enforcementAuthority` field.
Validation rejects those fields, including when nested. A specialist score is
not a probability of camera origin or synthetic content.

## Admission sequence

```text
raw specialist output
  -> validated measurement
  -> benchmark analysis
  -> transformation analysis
  -> calibration candidate
  -> directional validation policy
  -> Evidence Packet adapter
```

Only the final policy step may produce `SUPPORTS` or `CONTRADICTS`, and only
after Lythaus calibration policy has established applicability, direction,
uncertainty, and limitations. Until then the measurement is
`UNVALIDATED` or `MEASUREMENT_ONLY`.

## Family boundaries

- EF2 may describe acquisition-consistent pixel traces or an enrolled-device
  comparison. It must not infer depicted-content origin.
- EF3 may describe synthetic-image measurements. A weak or absent EF3 result
  cannot support camera-native origin.
- EF5 may describe a local manipulation score or mask. A global synthetic score
  is not automatically an EF5 localization result.

All families retain the two independent origin axes used by Evidence Packet v1:
camera acquisition and synthetic depicted content. Safety remains outside this
interface as `SAFETY_CONTEXT_ONLY`.

## Rights gate

Candidate records must separately report `codeRights`, `weightRights`,
`dataRights`, `evaluationRights`, and `commercialDeploymentRights`. A confirmed
repository license cannot fill an unresolved weight or training-data field.

## Benchmark gate

Every sample is assigned to one source-family split. Descendants, masks, parent
images, prompt/seed families, and camera/device families follow the split
boundary. The research validator rejects a family appearing in more than one
split.

The microbenchmark manifest is a foundation artifact only while it has no
rights-confirmed, provenance-confirmed source families. It must not be passed
to a model with truth fields visible.
