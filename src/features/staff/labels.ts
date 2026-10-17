export const LEAVE_KINDS: Record<string, string> = {
  annual_leave: "Congé annuel",
  sick_leave: "Congé maladie",
  maternity: "Congé maternité",
  paternity: "Congé paternité",
  training: "Formation",
  unpaid: "Congé sans solde",
  absence: "Absence",
  other: "Autre",
};

export const LEAVE_STATUS: Record<string, { label: string; variant: "warning" | "default" | "danger" | "muted" }> = {
  pending: { label: "En attente", variant: "warning" },
  approved: { label: "Approuvée", variant: "default" },
  rejected: { label: "Refusée", variant: "danger" },
  cancelled: { label: "Annulée", variant: "muted" },
};

export const CONTRACT_TYPES: Record<string, string> = {
  permanent: "CDI",
  fixed_term: "CDD",
  part_time: "Temps partiel",
  internship: "Stage",
  volunteer: "Bénévolat",
  civil_servant: "Fonctionnaire",
};
