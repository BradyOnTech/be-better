// FIT framing is provided by jimmykane/fit-parser (npm: fit-file-parser), SPDX: MIT.
import { FitEncoder, FitBaseType } from "fit-file-parser/encoder";
import {
  addDays,
  DomainError,
  type Athlete,
  type PlanSession,
} from "../../../packages/domain/src/index.js";
const escapeCalendar = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function fold(line: string) {
  let output = "",
    part = "";
  for (const character of line) {
    if (Buffer.byteLength(part + character) > 75) {
      output += `${part}\r\n`;
      part = " ";
    }
    part += character;
  }
  return output + part;
}
export function calendar(sessions: PlanSession[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Be Better//Training Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const session of sessions.filter((s) => s.status === "accepted"))
    lines.push(
      "BEGIN:VEVENT",
      `UID:${session.id}@be-better.local`,
      `DTSTAMP:${session.updatedAt.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART;VALUE=DATE:${session.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(session.date, 1).replace(/-/g, "")}`,
      `SUMMARY:${escapeCalendar(session.title)}`,
      `DESCRIPTION:${escapeCalendar(`${session.prescription}\n\n${session.durationSeconds ? `${Math.round(session.durationSeconds / 60)} minutes · RPE ${session.rpeTarget}` : "Rest day"}\n${session.reason}`)}`,
      `SEQUENCE:${session.version}`,
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
function exportable(session: PlanSession) {
  if (session.status !== "accepted")
    throw new DomainError(
      "EXPORT_STATUS",
      "Accept a workout before exporting it.",
    );
  if (session.intent === "rest")
    throw new DomainError(
      "EXPORT_REST",
      "A rest day does not need a workout file.",
    );
}
function expandedSteps(session: PlanSession) {
  const steps = session.steps?.length
    ? session.steps
    : [
        {
          kind: "free" as const,
          durationSeconds: session.durationSeconds,
          distanceMetres: null,
          repeats: 1,
          target: {
            metric: "rpe" as const,
            low: session.rpeTarget,
            high: session.rpeTarget,
          },
        },
      ];
  const expanded = steps.flatMap((step) =>
    Array.from({ length: step.repeats }, () => step),
  );
  if (expanded.length > 500)
    throw new DomainError(
      "EXPORT_STEPS",
      "This workout has too many steps to export.",
    );
  return expanded;
}
const cue = (step: ReturnType<typeof expandedSteps>[number]) =>
  step.target
    ? `${step.target.metric === "rpe" ? "RPE" : step.target.metric} ${step.target.low}${step.target.high !== step.target.low ? `–${step.target.high}` : ""}`
    : "Comfortable effort";
export function workoutFit(session: PlanSession) {
  exportable(session);
  const steps = expandedSteps(session);
  const encoder = new FitEncoder();
  const numeric = (
    number: number,
    baseType: FitBaseType,
    size: number,
    value: number,
  ) => ({ number, baseType, size, value });
  const string = (number: number, value: string) => {
    const bytes = FitEncoder.string(value.slice(0, 120));
    return {
      number,
      baseType: FitBaseType.String,
      size: bytes.length,
      value: bytes,
    };
  };
  encoder.writeMessage(0, [
    numeric(0, FitBaseType.Enum, 1, 5),
    numeric(1, FitBaseType.Uint16, 2, 255),
    numeric(
      4,
      FitBaseType.Uint32,
      4,
      FitEncoder.toFitTimestamp(new Date(session.updatedAt)),
    ),
  ]);
  encoder.writeMessage(26, [
    numeric(4, FitBaseType.Enum, 1, session.sport === "bike" ? 2 : 1),
    numeric(6, FitBaseType.Uint16, 2, steps.length),
    string(8, session.title),
  ]);
  steps.forEach((step, index) =>
    encoder.writeMessage(27, [
      numeric(254, FitBaseType.Uint16, 2, index),
      string(0, step.kind),
      numeric(1, FitBaseType.Enum, 1, step.distanceMetres ? 1 : 0),
      numeric(
        2,
        FitBaseType.Uint32,
        4,
        Math.round(
          step.distanceMetres
            ? step.distanceMetres * 100
            : step.durationSeconds! * 1000,
        ),
      ),
      numeric(3, FitBaseType.Enum, 1, 2),
      numeric(
        7,
        FitBaseType.Enum,
        1,
        step.kind === "warmup"
          ? 2
          : step.kind === "cooldown"
            ? 3
            : step.kind === "recover"
              ? 4
              : 0,
      ),
      string(8, cue(step)),
    ]),
  );
  return encoder.close();
}
export function workoutZwo(session: PlanSession, athlete: Athlete) {
  exportable(session);
  if (session.sport !== "bike")
    throw new DomainError(
      "ZWO_SPORT",
      "Zwift workout export is available for cycling. Use FIT or the calendar for this session.",
    );
  const steps = expandedSteps(session);
  if (steps.some((step) => step.distanceMetres))
    throw new DomainError(
      "ZWO_DISTANCE",
      "Zwift cycling steps need time durations.",
    );
  const xml = steps
    .map((step) => {
      if (step.target?.metric === "power") {
        const ftp = athlete.thresholds.ftp?.value;
        if (!ftp)
          throw new DomainError(
            "FTP",
            "Set your FTP before exporting power targets to Zwift.",
          );
        return `<SteadyState Duration="${step.durationSeconds}" Power="${((step.target.low + step.target.high) / 2 / ftp).toFixed(4)}"><textevent timeoffset="0" message="${escapeXml(cue(step))}"/></SteadyState>`;
      }
      return `<FreeRide Duration="${step.durationSeconds}"><textevent timeoffset="0" message="${escapeXml(cue(step))}"/></FreeRide>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file><author>Be Better</author><name>${escapeXml(session.title)}</name><description>${escapeXml(`${session.prescription} ${session.reason}`)}</description><sportType>bike</sportType><workout>${xml}</workout></workout_file>`;
}
