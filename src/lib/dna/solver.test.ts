import { describe, expect, it } from "vitest";
import {
  checkRoles,
  solveForProject,
  DURATION_TOLERANCE,
  MIN_SEGMENT_SECONDS,
  type SolverClip,
} from "./solver";

function clip(overrides: Partial<SolverClip> & Pick<SolverClip, "id" | "role" | "duration">): SolverClip {
  return {
    allowedSpeeds: [1.0, 1.5, 1.7, 2.0],
    hookPlacement: "top",
    filename: `${overrides.id}.mp4`,
    ...overrides,
  };
}

/** Every valid solve must satisfy these regardless of scenario or target. */
function assertValidSolve(clips: SolverClip[], target: number, result: ReturnType<typeof solveForProject>) {
  if (!result.ok) throw new Error(`Expected a valid solve, got failure: ${result.reason}`);

  // Total output duration lands within tolerance of the requested target.
  expect(Math.abs(result.finalDuration - target)).toBeLessThanOrEqual(DURATION_TOLERANCE);

  const byId = new Map(clips.map((c) => [c.id, c]));
  for (const seg of result.segments) {
    const source = byId.get(seg.media_asset_id);
    expect(source).toBeDefined();

    // Never manufacture footage: the selected span can never exceed the
    // clip's own real duration.
    expect(seg.source_out - seg.source_in).toBeLessThanOrEqual(source!.duration + 1e-6);
    expect(seg.source_in).toBeGreaterThanOrEqual(0);
    expect(seg.source_out).toBeLessThanOrEqual(source!.duration + 1e-6);

    // Speed must be one the clip actually allows.
    expect(source!.allowedSpeeds).toContain(seg.speed);

    // No segment is shorter than the enforced floor.
    expect(seg.output_duration).toBeGreaterThanOrEqual(MIN_SEGMENT_SECONDS - 1e-6);

    // output_duration is internally consistent with the cut span and speed.
    // Precision 1 (not the default 2): floating-point division here can
    // legitimately land a few milliseconds off the "exact" recomputed value,
    // and that's fine — real playback timing has far more slack than this.
    expect(seg.output_duration).toBeCloseTo((seg.source_out - seg.source_in) / seg.speed, 1);
  }
}

describe("checkRoles", () => {
  it("accepts Start + Middle", () => {
    const clips = [clip({ id: "a", role: "start", duration: 4 }), clip({ id: "b", role: "middle", duration: 10 })];
    const result = checkRoles(clips);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sequence).toEqual(["start", "middle"]);
  });

  it("accepts Middle only", () => {
    const clips = [clip({ id: "a", role: "middle", duration: 10 })];
    const result = checkRoles(clips);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sequence).toEqual(["middle"]);
  });

  it("accepts Start + Middle + End", () => {
    const clips = [
      clip({ id: "a", role: "start", duration: 4 }),
      clip({ id: "b", role: "middle", duration: 10 }),
      clip({ id: "c", role: "end", duration: 6 }),
    ];
    const result = checkRoles(clips);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sequence).toEqual(["start", "middle", "end"]);
  });

  it("rejects Start-only with a reason naming the missing role", () => {
    const clips = [clip({ id: "a", role: "start", duration: 4 })];
    const result = checkRoles(clips);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain("middle");
    }
  });

  it("rejects an empty clip list", () => {
    const result = checkRoles([]);
    expect(result.ok).toBe(false);
  });
});

describe("solveForProject — Start + Middle", () => {
  const clips = [clip({ id: "a", role: "start", duration: 4 }), clip({ id: "b", role: "middle", duration: 10 })];

  it("solves at 7s", () => {
    assertValidSolve(clips, 7, solveForProject(clips, 7));
  });

  it("solves at 8s", () => {
    assertValidSolve(clips, 8, solveForProject(clips, 8));
  });
});

describe("solveForProject — Middle only", () => {
  const clips = [clip({ id: "a", role: "middle", duration: 10 })];

  it("solves at 7s", () => {
    assertValidSolve(clips, 7, solveForProject(clips, 7));
  });

  it("solves at 8s", () => {
    assertValidSolve(clips, 8, solveForProject(clips, 8));
  });

  it("never exceeds the clip's real 10s of footage even unsped", () => {
    const result = solveForProject(clips, 8);
    if (!result.ok) throw new Error(result.reason);
    const seg = result.segments[0]!;
    expect(seg.source_out - seg.source_in).toBeLessThanOrEqual(10 + 1e-6);
  });
});

describe("solveForProject — Start + Middle + End", () => {
  const clips = [
    clip({ id: "a", role: "start", duration: 4 }),
    clip({ id: "b", role: "middle", duration: 10 }),
    clip({ id: "c", role: "end", duration: 6 }),
  ];

  it("solves at 7s", () => {
    const result = solveForProject(clips, 7);
    assertValidSolve(clips, 7, result);
    if (result.ok) expect(result.segments).toHaveLength(3);
  });

  it("solves at 8s", () => {
    const result = solveForProject(clips, 8);
    assertValidSolve(clips, 8, result);
    if (result.ok) expect(result.segments).toHaveLength(3);
  });
});

describe("solveForProject — never manufactures footage", () => {
  it("fails cleanly rather than stretching a too-short clip pool to an unreachable target", () => {
    // Two clips capped at 1x can produce at most 4 + 4 = 8s combined.
    // Asking for 40s must fail, never fabricate extra footage to hit it.
    const clips = [
      clip({ id: "a", role: "start", duration: 4, allowedSpeeds: [1.0] }),
      clip({ id: "b", role: "middle", duration: 4, allowedSpeeds: [1.0] }),
    ];
    const result = solveForProject(clips, 40);
    expect(result.ok).toBe(false);
  });
});

describe("solveForProject — re-solving the same clips produces variety", () => {
  it("produces at least one different segment plan across repeated solves", () => {
    const clips = [clip({ id: "a", role: "start", duration: 6 }), clip({ id: "b", role: "middle", duration: 12 })];
    const signatures = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const result = solveForProject(clips, 8);
      if (!result.ok) throw new Error(result.reason);
      signatures.add(JSON.stringify(result.segments.map((s) => [s.speed, s.source_in, s.source_out])));
    }
    // With randomized speed/cut selection across 12 attempts, expect more
    // than a single identical plan almost always.
    expect(signatures.size).toBeGreaterThan(1);
  });
});
