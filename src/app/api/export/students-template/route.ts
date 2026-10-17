import { importTemplateCsv } from "@/features/students/import";
import { csvResponse } from "@/server/http";

export function GET() {
  return csvResponse(importTemplateCsv(), "modele-import-eleves.csv");
}
