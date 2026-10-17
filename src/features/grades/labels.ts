export const ASSESSMENT_STATUS: Record<string, { label: string; variant: "muted" | "warning" | "default" | "solid" }> = {
  draft: { label: "Brouillon", variant: "muted" },
  submitted: { label: "Soumise", variant: "warning" },
  validated: { label: "Validée", variant: "default" },
  published: { label: "Publiée", variant: "solid" },
};

export const REPORT_CARD_STATUS: Record<string, { label: string; variant: "muted" | "default" | "solid" }> = {
  draft: { label: "Brouillon", variant: "muted" },
  validated: { label: "Validé", variant: "default" },
  published: { label: "Publié", variant: "solid" },
};
