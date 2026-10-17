export const INVOICE_STATUS: Record<
  string,
  { label: string; variant: "default" | "warning" | "danger" | "muted" | "solid" }
> = {
  draft: { label: "Brouillon", variant: "muted" },
  issued: { label: "À payer", variant: "warning" },
  partially_paid: { label: "Paiement partiel", variant: "warning" },
  paid: { label: "Payée", variant: "default" },
  cancelled: { label: "Annulée", variant: "muted" },
};

export const FEE_CATEGORIES: Record<string, string> = {
  tuition: "Scolarité",
  registration: "Inscription",
  exam: "Examen",
  transport: "Transport",
  canteen: "Cantine",
  uniform: "Uniforme",
  supplies: "Fournitures",
  activity: "Activités",
  other: "Autre",
};

export const METHOD_KINDS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  bank_transfer: "Virement",
  card: "Carte",
  cheque: "Chèque",
  other: "Autre",
};

export const EXPENSE_STATUS: Record<string, { label: string; variant: "warning" | "default" | "danger" | "solid" }> = {
  pending: { label: "À approuver", variant: "warning" },
  approved: { label: "Approuvée", variant: "default" },
  paid: { label: "Payée", variant: "solid" },
  rejected: { label: "Rejetée", variant: "danger" },
};
