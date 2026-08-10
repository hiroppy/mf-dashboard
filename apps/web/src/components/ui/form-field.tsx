import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { MetricLabel } from "./metric-label";

interface FormFieldProps {
  children: ReactNode;
  label: string;
  htmlFor: string;
  description?: ReactNode;
  className?: string;
  labelClassName?: string;
}

function FormField({
  children,
  label,
  htmlFor,
  description,
  className,
  labelClassName,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <MetricLabel
        title={label}
        description={description}
        htmlFor={htmlFor}
        className={labelClassName}
      />
      {children}
    </div>
  );
}

export { FormField };
