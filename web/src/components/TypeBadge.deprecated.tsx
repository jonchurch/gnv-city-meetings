import { Badge } from "@/components/ui/badge";

const typeConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  procedural: { label: "Procedural", variant: "secondary" },
  presentation: { label: "Presentation", variant: "default" },
  discussion: { label: "Discussion", variant: "outline" },
  public_comment: { label: "Public Comment", variant: "outline" },
};

interface TypeBadgeProps {
  type: string;
}

export function TypeBadge({ type }: TypeBadgeProps) {
  const config = typeConfig[type] || { label: type, variant: "secondary" as const };

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
