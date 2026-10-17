"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { setGrantAction } from "./actions";

interface Role {
  id: string;
  key: string;
  name: string;
  is_system: boolean;
  is_privileged: boolean;
}
interface Perm {
  key: string;
  resource: string;
  action: string;
  label: string;
  sensitive: boolean;
}

const SCOPES: [string, string][] = [
  ["none", "—"],
  ["school", "Établissement"],
  ["assigned", "Classes attribuées"],
  ["linked", "Enfants rattachés"],
  ["self", "Soi-même"],
];

export function RolesMatrix({
  roles,
  permissions,
  grants,
  editable,
}: {
  roles: Role[];
  permissions: Perm[];
  grants: Record<string, string>;
  editable: boolean;
}) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [, start] = useTransition();
  const [state, apply] = useOptimistic(grants, (s, p: { key: string; scope: string }) => ({ ...s, [p.key]: p.scope }));
  const role = roles.find((r) => r.id === roleId);
  const groups = [...new Set(permissions.map((p) => p.resource))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          aria-label="Rôle"
          className="w-auto min-w-64"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        {role?.is_system && <Badge variant="muted">Rôle système</Badge>}
        {role?.is_privileged && <Badge variant="warning">Privilégié</Badge>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g} className="rounded-xl border p-3">
            <legend className="text-muted-foreground px-1 text-xs font-semibold tracking-wider uppercase">{g}</legend>
            <ul className="space-y-1.5">
              {permissions
                .filter((p) => p.resource === g)
                .map((p) => {
                  const key = `${roleId}|${p.key}`;
                  const value = state[key] ?? "none";
                  return (
                    <li key={p.key} className="flex items-center gap-2 text-sm">
                      <span className={cn("flex-1", value === "none" && "text-muted-foreground")}>
                        {p.label}
                        {p.sensitive && (
                          <span className="dark:text-highlight ml-1 text-xs text-[#a37800]">• sensible</span>
                        )}
                      </span>
                      <Select
                        aria-label={`Portée pour ${p.label}`}
                        className="h-8 w-44 text-xs"
                        disabled={!editable}
                        value={value}
                        onChange={(e) => {
                          const scope = e.target.value;
                          start(async () => {
                            apply({ key, scope });
                            const res = await setGrantAction(roleId, p.key, scope);
                            if (!res.ok) toast.error(res.error);
                          });
                        }}
                      >
                        {SCOPES.map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </li>
                  );
                })}
            </ul>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
