export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
            ◈
          </div>
          <div>
            <h1 className="font-semibold leading-none">AI Trading Research</h1>
            <p className="text-xs text-muted-foreground">NL → Strategy → Backtest</p>
          </div>
        </div>
      </div>
    </header>
  );
}
