import { OperationsCenter } from "@/components/operations-center/OperationsCenter";

const OperationsCenterPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 h-16 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Operations Center</h1>
            <p className="text-sm text-muted-foreground">Monitor listings, queues, and stray tasks.</p>
          </div>
        </div>
      </header>
      <main className="px-4 py-6">
        <OperationsCenter />
      </main>
    </div>
  );
};

export default OperationsCenterPage;
