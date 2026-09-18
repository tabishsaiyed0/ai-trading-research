import { Database, FlaskConical, TrendingUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

type InfraFeature = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const INFRA_FEATURES: InfraFeature[] = [
  { key: "redis", title: "Redis", description: "OHLCV + results cached", icon: Database },
  { key: "s3", title: "S3", description: "Backtests persisted", icon: Database },
  { key: "bedrock", title: "Bedrock", description: "NL → JSON compiler", icon: FlaskConical },
];

export function EmptyResultsCard() {
  return (
    <Card className="border-dashed p-12 text-center">
      <div className="mb-3 flex justify-center">
        <TrendingUp className="size-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium">No backtest yet</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Parse a strategy then run backtest. Results: equity curve, Sharpe,
        drawdown, trades, cached in Redis & persisted to S3.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-left">
        {INFRA_FEATURES.map((f) => (
          <div key={f.key} className="rounded-lg bg-muted p-3">
            <div className="font-medium">{f.title}</div>
            <div className="text-muted-foreground">{f.description}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
