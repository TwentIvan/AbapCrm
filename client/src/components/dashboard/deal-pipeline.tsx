import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Deal } from "@shared/schema";
import { Link } from "wouter";

const stageColors = {
  prospecting: "bg-blue-500",
  proposal: "bg-yellow-500",
  negotiation: "bg-orange-500",
  closing: "bg-green-500",
};

const stageLabels = {
  prospecting: "Prospecting",
  proposal: "Proposal", 
  negotiation: "Negotiation",
  closing: "Closing",
};

export default function DealPipeline() {
  const { data: deals, isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const activeDeals = deals?.filter(deal => !["won", "lost"].includes(deal.stage)) || [];
  
  const pipelineData = Object.entries(stageLabels).map(([stage, label]) => {
    const stageDeals = activeDeals.filter(deal => deal.stage === stage);
    const value = stageDeals.reduce((sum, deal) => sum + parseFloat(deal.value), 0);
    
    return {
      stage: stage as keyof typeof stageLabels,
      label,
      value,
      count: stageDeals.length,
    };
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Deal Pipeline</CardTitle>
          <Link href="/deals">
            <Button variant="ghost" size="sm" data-testid="button-view-pipeline">
              View Pipeline
            </Button>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : activeDeals.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground" data-testid="text-no-deals">
              No active deals in pipeline
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pipelineData.map((stage) => (
              <div 
                key={stage.stage} 
                className="flex items-center justify-between"
                data-testid={`pipeline-stage-${stage.stage}`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 ${stageColors[stage.stage]} rounded-full`}></div>
                  <span className="text-sm font-medium text-foreground">
                    {stage.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({stage.count})
                  </span>
                </div>
                <span className="text-sm text-muted-foreground" data-testid={`pipeline-value-${stage.stage}`}>
                  €{stage.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
