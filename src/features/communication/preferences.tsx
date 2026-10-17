"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { setPreferenceAction } from "./actions";

const CHANNELS = [
  ["in_app", "Application"],
  ["email", "E-mail"],
  ["sms", "SMS"],
] as const;

export function NotificationPreferences({
  types,
  values,
}: {
  types: [string, string][];
  values: Record<string, boolean>;
}) {
  const [, start] = useTransition();
  const [state, setOptimistic] = useOptimistic(values, (s, p: { key: string; v: boolean }) => ({ ...s, [p.key]: p.v }));
  return (
    <Table>
      <THead>
        <TR>
          <TH>Type</TH>
          {CHANNELS.map(([, label]) => (
            <TH key={label} className="text-center">
              {label}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {types.map(([type, label]) => (
          <TR key={type}>
            <TD>{label}</TD>
            {CHANNELS.map(([ch]) => {
              const key = `${type}|${ch}`;
              return (
                <TD key={ch} className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`${label} — ${ch}`}
                    className="size-4 accent-[var(--primary)]"
                    checked={state[key] ?? false}
                    onChange={(e) => {
                      const v = e.target.checked;
                      start(async () => {
                        setOptimistic({ key, v });
                        const res = await setPreferenceAction(type, ch, v);
                        if (!res.ok) toast.error(res.error);
                      });
                    }}
                  />
                </TD>
              );
            })}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
