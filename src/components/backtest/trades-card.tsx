import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/backtest/types";

type TradesCardProps = {
  trades: Trade[];
  maxVisible?: number;
};

export function TradesCard({ trades, maxVisible = 20 }: TradesCardProps) {
  const visible = trades.slice(0, maxVisible);
  const remaining = trades.length - visible.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Trades{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({trades.length} total)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-auto scrollbar-thin">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead className="text-right">PnL</TableHead>
                <TableHead className="text-right">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="font-mono">
              {visible.map((t, i) => (
                <TableRow key={`${t.entryTime}-${t.exitTime}-${i}`}>
                  <TableCell>
                    {t.entryTime} @ {t.entryPrice.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {t.exitTime} @ {t.exitPrice.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      t.pnl >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {t.pnl.toFixed(2)} ({t.pnlPct.toFixed(1)}%)
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {t.exitReason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {remaining > 0 && (
            <div className="text-center text-muted-foreground text-xs mt-2">
              + {remaining} more
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
