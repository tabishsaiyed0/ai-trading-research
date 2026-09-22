import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Condition, Strategy } from "@/lib/strategy/schema";

type ConditionGroupProps = {
  title: string;
  logic: string;
  conditions: Condition[];
  footer?: string | null;
};

function ConditionGroup({ title, logic, conditions, footer }: ConditionGroupProps) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-xs text-muted-foreground">
        {title} ({logic})
      </div>
      <ul className="mt-1 space-y-1 font-mono text-xs">
        {conditions.map((c, i) => (
          <li key={`${c.left}-${c.operator}-${c.right}-${i}`}>
            {c.left} {c.operator} {c.right}
          </li>
        ))}
      </ul>
      {footer && <div className="text-xs mt-2 text-muted-foreground">{footer}</div>}
    </div>
  );
}

type CompiledStrategyCardProps = {
  strategy: Strategy;
  isBacktesting: boolean;
  onRunBacktest: () => void;
};

export function CompiledStrategyCard({
  strategy,
  isBacktesting,
  onRunBacktest,
}: CompiledStrategyCardProps) {
  const riskFooter =
    strategy.exit.stopLossPct || strategy.exit.takeProfitPct
      ? `SL: ${strategy.exit.stopLossPct ?? "-"}% • TP: ${strategy.exit.takeProfitPct ?? "-"}%`
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Compiled Strategy</CardTitle>
          <Badge variant="secondary">
            {strategy.universe.symbols.join(", ")} • {strategy.universe.timeframe}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <span className="font-medium">{strategy.name}</span>
          <p className="text-muted-foreground">{strategy.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ConditionGroup
            title="ENTRY"
            logic={strategy.entry.logic}
            conditions={strategy.entry.conditions}
          />
          <ConditionGroup
            title="EXIT"
            logic={strategy.exit.logic}
            conditions={strategy.exit.conditions}
            footer={riskFooter}
          />
        </div>
        <details className="rounded-lg bg-zinc-950 text-zinc-100 p-3 dark:bg-zinc-900">
          <summary className="cursor-pointer text-xs">View JSON</summary>
          <pre className="mt-2 text-xs overflow-auto max-h-64 scrollbar-thin">
            {JSON.stringify(strategy, null, 2)}
          </pre>
        </details>
        <Button
          onClick={onRunBacktest}
          disabled={isBacktesting}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700"
        >
          {isBacktesting ? (
            <>
              <Loader2 className="animate-spin" /> Running Backtest...
            </>
          ) : (
            <>
              <Play /> Run Backtest (500 bars mock)
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
