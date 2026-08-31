import { cn } from "@/lib/utils";

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "outline" | "success";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
        {
          "bg-accent text-accent-foreground dark:bg-primary/20 dark:text-primary":
            variant === "default" || variant === "success",
          "bg-muted text-muted-foreground":
            variant === "secondary",
          "border border-border text-foreground":
            variant === "outline",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
