import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TreeNode {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  metadata?: Record<string, any>;
  onClick?: () => void;
  actions?: React.ReactNode;
}

interface TreeViewProps {
  nodes: TreeNode[];
  defaultExpanded?: boolean;
  className?: string;
  renderNode?: (node: TreeNode, isExpanded: boolean, hasChildren: boolean) => React.ReactNode;
}

export function TreeView({ 
  nodes, 
  defaultExpanded = false, 
  className,
  renderNode 
}: TreeViewProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {nodes.map((node) => (
        <TreeNodeItem
          key={node.id}
          node={node}
          level={0}
          defaultExpanded={defaultExpanded}
          renderNode={renderNode}
        />
      ))}
    </div>
  );
}

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  defaultExpanded: boolean;
  renderNode?: (node: TreeNode, isExpanded: boolean, hasChildren: boolean) => React.ReactNode;
}

function TreeNodeItem({ node, level, defaultExpanded, renderNode }: TreeNodeItemProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;

  const toggleExpand = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  if (renderNode) {
    return (
      <div>
        <div 
          className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
          style={{ paddingLeft: `${level * 24 + 12}px` }}
          onClick={toggleExpand}
          data-testid={`tree-node-${node.id}`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand();
            }}
            className={cn(
              "p-0 h-4 w-4 flex items-center justify-center transition-transform",
              !hasChildren && "invisible"
            )}
            data-testid={`tree-toggle-${node.id}`}
          >
            {hasChildren && (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            )}
          </button>
          
          <div className="flex-1 flex items-center gap-2">
            {renderNode(node, isExpanded, !!hasChildren)}
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div className="mt-1">
            {node.children!.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                level={level + 1}
                defaultExpanded={defaultExpanded}
                renderNode={renderNode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div 
        className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
        style={{ paddingLeft: `${level * 24 + 12}px` }}
        onClick={toggleExpand}
        data-testid={`tree-node-${node.id}`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand();
          }}
          className={cn(
            "p-0 h-4 w-4 flex items-center justify-center transition-transform",
            !hasChildren && "invisible"
          )}
          data-testid={`tree-toggle-${node.id}`}
        >
          {hasChildren && (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          )}
        </button>
        
        {node.icon && <span className="flex-shrink-0">{node.icon}</span>}
        
        <div className="flex-1 flex items-center justify-between gap-2">
          <span 
            className="text-sm font-medium cursor-pointer hover:text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              node.onClick?.();
            }}
            data-testid={`tree-label-${node.id}`}
          >
            {node.label}
          </span>
          
          {node.actions && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {node.actions}
            </div>
          )}
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="mt-1">
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              defaultExpanded={defaultExpanded}
              renderNode={renderNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
