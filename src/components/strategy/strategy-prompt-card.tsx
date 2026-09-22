import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EXAMPLE_PREVIEW_LENGTH } from "@/lib/strategy/examples";

type StrategyPromptCardProps = {
  prompt: string;
  examples: readonly string[];
  isParsing: boolean;
  error: string | null;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
};

function truncate(text: string, max = EXAMPLE_PREVIEW_LENGTH) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function StrategyPromptCard({
  prompt,
  examples,
  isParsing,
  error,
  onPromptChange,
  onGenerate,
}: StrategyPromptCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Natural Language Strategy</CardTitle>
        <CardDescription>
          Describe your idea in plain English. Example: RSI mean-reversion, SMA
          crossover, breakout...
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={4}
          placeholder="e.g. Buy when RSI(14) < 30 and sell when RSI > 70"
        />
        <TooltipProvider>
          <div className="flex gap-2 flex-wrap">
            {examples.map((ex) => (
              <Tooltip key={ex}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full font-normal"
                    onClick={() => onPromptChange(ex)}
                  >
                    {truncate(ex)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{ex}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
        <Button onClick={onGenerate} disabled={isParsing || !prompt.trim()} className="w-full">
          {isParsing ? (
            <>
              <Loader2 className="animate-spin" /> Parsing with AI...
            </>
          ) : (
            <>
              <Sparkles /> Generate Strategy <ArrowRight />
            </>
          )}
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
