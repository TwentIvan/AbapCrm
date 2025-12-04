import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#6366f1", // indigo
];

interface ChartDataPoint {
  label: string;
  value: number;
  count: number;
}

interface ChartWidgetProps {
  entityKey: string;
  groupBy?: string;
  valueField?: string;
  aggregation?: "count" | "sum" | "avg" | "min" | "max";
  filterField?: string;
  filterValues?: string[];
  showLegend?: boolean;
  showLabels?: boolean;
  colors?: string[];
  title?: string;
}

function useChartData(props: ChartWidgetProps) {
  const { currentOrganizationId } = useOrganization();
  
  const params = new URLSearchParams();
  if (props.groupBy) params.set("groupBy", props.groupBy);
  if (props.valueField) params.set("valueField", props.valueField);
  if (props.aggregation) params.set("aggregation", props.aggregation);
  if (props.filterField) params.set("filterField", props.filterField);
  if (props.filterValues?.length) params.set("filterValues", props.filterValues.join(","));
  
  return useQuery<ChartDataPoint[]>({
    queryKey: [`/api/widget-data/${props.entityKey}`, params.toString()],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId && !!props.entityKey,
  });
}

export function PieChartWidget(props: ChartWidgetProps) {
  const { data, isLoading } = useChartData(props);
  const colors = props.colors || CHART_COLORS;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Caricamento...
      </div>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Nessun dato disponibile
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius="80%"
          label={props.showLabels !== false ? ({ label, percent }) => 
            `${label} (${(percent * 100).toFixed(0)}%)`
          : undefined}
          labelLine={props.showLabels !== false}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        {props.showLegend !== false && <Legend />}
        <Tooltip 
          formatter={(value: number) => [value, "Valore"]}
          contentStyle={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
            borderRadius: "8px",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BarChartWidget(props: ChartWidgetProps) {
  const { data, isLoading } = useChartData(props);
  const colors = props.colors || CHART_COLORS;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Caricamento...
      </div>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Nessun dato disponibile
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis 
          dataKey="label" 
          tick={{ fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={60}
          className="fill-muted-foreground"
        />
        <YAxis className="fill-muted-foreground" />
        <Tooltip 
          contentStyle={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
            borderRadius: "8px",
          }}
        />
        {props.showLegend !== false && <Legend />}
        <Bar 
          dataKey="value" 
          name={props.valueField || "Conteggio"}
          fill={colors[0]}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartWidget(props: ChartWidgetProps) {
  const { data, isLoading } = useChartData(props);
  const colors = props.colors || CHART_COLORS;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Caricamento...
      </div>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Nessun dato disponibile
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis 
          dataKey="label"
          tick={{ fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={60}
          className="fill-muted-foreground"
        />
        <YAxis className="fill-muted-foreground" />
        <Tooltip 
          contentStyle={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
            borderRadius: "8px",
          }}
        />
        {props.showLegend !== false && <Legend />}
        <Line 
          type="monotone" 
          dataKey="value" 
          name={props.valueField || "Valore"}
          stroke={colors[0]}
          strokeWidth={2}
          dot={{ fill: colors[0], strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaChartWidget(props: ChartWidgetProps) {
  const { data, isLoading } = useChartData(props);
  const colors = props.colors || CHART_COLORS;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Caricamento...
      </div>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Nessun dato disponibile
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis 
          dataKey="label"
          tick={{ fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={60}
          className="fill-muted-foreground"
        />
        <YAxis className="fill-muted-foreground" />
        <Tooltip 
          contentStyle={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
            borderRadius: "8px",
          }}
        />
        {props.showLegend !== false && <Legend />}
        <Area 
          type="monotone" 
          dataKey="value" 
          name={props.valueField || "Valore"}
          stroke={colors[0]}
          fill={colors[0]}
          fillOpacity={0.3}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface CounterWidgetProps {
  entityKey: string;
  filterField?: string;
  filterValues?: string[];
  label?: string;
  icon?: string;
  color?: string;
}

export function CounterWidget(props: CounterWidgetProps) {
  const { currentOrganizationId } = useOrganization();
  
  const params = new URLSearchParams();
  if (props.filterField) params.set("filterField", props.filterField);
  if (props.filterValues?.length) params.set("filterValues", props.filterValues.join(","));
  
  const { data, isLoading } = useQuery<ChartDataPoint[]>({
    queryKey: [`/api/widget-data/${props.entityKey}`, params.toString()],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId && !!props.entityKey,
  });
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Caricamento...
      </div>
    );
  }

  const count = data?.[0]?.value || 0;
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <div 
        className="text-6xl font-bold mb-2"
        style={{ color: props.color || "#3b82f6" }}
      >
        {count}
      </div>
      {props.label && (
        <div className="text-lg text-muted-foreground text-center">
          {props.label}
        </div>
      )}
    </div>
  );
}

export type { ChartWidgetProps, CounterWidgetProps };
