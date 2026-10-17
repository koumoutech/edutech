"use client";

import { TableIcon, BarChart3Icon } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export interface Series {
  key: string;
  label: string;
  /** 1..3 — fixed categorical order, never cycled. */
  slot?: 1 | 2 | 3;
}

type Row = Record<string, string | number | null>;

/** Serializable value format (props must be passable from Server Components). */
export type ValueFormat = "number" | "integer" | "score" | "percent" | "money";

function formatter(kind: ValueFormat = "number", currency = "XOF"): (v: number) => string {
  switch (kind) {
    case "integer":
      return (v) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v);
    case "score":
      return (v) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v);
    case "percent":
      return (v) => new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(v);
    case "money":
      return (v) =>
        new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency,
          notation: Math.abs(v) >= 1e6 ? "compact" : "standard",
          maximumFractionDigits: 0,
        }).format(v);
    default:
      return (v) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v);
  }
}

const SLOT_VAR = { 1: "var(--chart-1)", 2: "var(--chart-2)", 3: "var(--chart-3)" } as const;

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: TooltipContentProps<number, string> & { format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover rounded-lg border px-3 py-2 text-xs shadow-[var(--shadow-lift)]">
      <p className="text-foreground mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="text-muted-foreground flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span>{p.name}</span>
          <span className="text-foreground ml-auto font-semibold tabular-nums">{format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

/** Wraps a chart with an accessible table view (identity never relies on color alone). */
function WithTable({
  data,
  xKey,
  series,
  format,
  children,
  label,
}: {
  data: Row[];
  xKey: string;
  series: Series[];
  format: (v: number) => string;
  children: React.ReactNode;
  label: string;
}) {
  const [table, setTable] = useState(false);
  return (
    <div className="relative">
      <div className="absolute -top-11 right-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
          aria-label={table ? "Afficher le graphique" : "Afficher le tableau"}
        >
          {table ? <BarChart3Icon /> : <TableIcon />}
        </Button>
      </div>
      {table ? (
        <Table aria-label={label}>
          <THead>
            <TR>
              <TH />
              {series.map((s) => (
                <TH key={s.key} className="text-right">
                  {s.label}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {data.map((row) => (
              <TR key={String(row[xKey])}>
                <TD className="font-medium">{row[xKey]}</TD>
                {series.map((s) => (
                  <TD key={s.key} className="text-right tabular-nums">
                    {row[s.key] === null || row[s.key] === undefined ? "—" : format(Number(row[s.key]))}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <div role="img" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export function BarChartView({
  data,
  xKey,
  series,
  height = 260,
  stacked = false,
  valueFormat,
  currency,
  label,
  yDomain,
}: {
  data: Row[];
  xKey: string;
  series: Series[];
  height?: number;
  stacked?: boolean;
  valueFormat?: ValueFormat;
  currency?: string;
  label: string;
  yDomain?: [number, number];
}) {
  const format = formatter(valueFormat, currency);
  return (
    <WithTable data={data} xKey={xKey} series={series} format={format} label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="24%" barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} tickFormatter={(v: number) => format(v)} domain={yDomain} width={48} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} format={format} />}
          />
          {series.length > 1 && (
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
          )}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SLOT_VAR[s.slot ?? ((i + 1) as 1 | 2 | 3)]}
              stackId={stacked ? "stack" : undefined}
              radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
              stroke="var(--card)"
              strokeWidth={stacked ? 2 : 0}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </WithTable>
  );
}

export function AreaChartView({
  data,
  xKey,
  series,
  height = 240,
  valueFormat,
  currency,
  label,
  yDomain,
}: {
  data: Row[];
  xKey: string;
  series: Series[];
  height?: number;
  valueFormat?: ValueFormat;
  currency?: string;
  label: string;
  yDomain?: [number, number];
}) {
  const format = formatter(valueFormat, currency);
  return (
    <WithTable data={data} xKey={xKey} series={series} format={format} label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SLOT_VAR[s.slot ?? ((i + 1) as 1 | 2 | 3)]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SLOT_VAR[s.slot ?? ((i + 1) as 1 | 2 | 3)]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} tickFormatter={(v: number) => format(v)} domain={yDomain} width={48} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} format={format} />}
          />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={SLOT_VAR[s.slot ?? ((i + 1) as 1 | 2 | 3)]}
              strokeWidth={2}
              fill={`url(#fill-${s.key})`}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </WithTable>
  );
}
