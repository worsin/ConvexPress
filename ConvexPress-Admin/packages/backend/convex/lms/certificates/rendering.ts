import { docToText } from "../lessons/helpers";

export const DEFAULT_CERTIFICATE_TEMPLATE_TEXT =
  "Certificate of Completion\n\nAwarded to {{learner_name}} for completing {{course_title}}.\n\nIssued {{completion_date}}\nSerial {{serial}}";

type MergeValueInput = {
  learnerName: string;
  courseTitle: string;
  issuedAt: number;
  serial: string;
  certificateTitle: string;
  points?: number;
};

export function buildCertificateMergeValues(input: MergeValueInput) {
  const completionDate = formatCertificateDate(input.issuedAt);
  const points = input.points === undefined ? "" : String(input.points);
  return {
    learnerName: input.learnerName,
    learner_name: input.learnerName,
    courseTitle: input.courseTitle,
    course_title: input.courseTitle,
    issuedDate: completionDate,
    issued_date: completionDate,
    completionDate,
    completion_date: completionDate,
    serial: input.serial,
    certificateTitle: input.certificateTitle,
    certificate_title: input.certificateTitle,
    points,
    coursePoints: points,
    course_points: points,
  };
}

export function renderCertificateText(
  templateDoc: unknown,
  vars: Record<string, string>,
) {
  const source = docToText(templateDoc) || DEFAULT_CERTIFICATE_TEMPLATE_TEXT;
  return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

export function formatCertificateDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
