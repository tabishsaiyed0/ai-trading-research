import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: string;
  align?: "center" | "left";
  className?: string;
};

export function StatTile({ label, value, align = "center", className }: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-muted p-3",
        align === "center" ? "text-center" : "text-left",
        className
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
