import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/utils";

const cardBaseClassName = "rounded-xl border bg-card text-card-foreground shadow-sm";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  href?: string;
  target?: string;
  ref?: Ref<HTMLDivElement>;
}

function Card({ className, href, target, children, ref, ...props }: CardProps) {
  const card = (
    <div
      ref={ref}
      className={cn(
        cardBaseClassName,
        href && "transition-colors hover:bg-muted/50 h-full",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );

  if (!href) return card;

  if (target === "_blank") {
    return (
      <Link href={href as Route} target="_blank" rel="noopener noreferrer" className="h-full">
        {card}
      </Link>
    );
  }

  return (
    <Link href={href as Route} className="block h-full">
      {card}
    </Link>
  );
}

type CardButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

function CardButton({ className, type = "button", ...props }: CardButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        cardBaseClassName,
        "h-full w-full cursor-pointer text-left transition-colors hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  action?: React.ReactNode;
  ref?: Ref<HTMLDivElement>;
}

function CardHeader({ className, action, children, ref, ...props }: CardHeaderProps) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-4 pb-4 sm:p-6 sm:pb-2", className)}
      {...props}
    >
      {action ? (
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="self-start">{children}</div>
          {action}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

interface CardTitleProps extends HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  ref?: Ref<HTMLDivElement>;
}

function CardTitle({ className, icon: Icon, children, ref, ...props }: CardTitleProps) {
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-2 font-bold leading-none tracking-tight", className)}
      {...props}
    >
      <Icon className="h-5 w-5 text-primary shrink-0" />
      {children}
    </div>
  );
}

interface CardDescriptionProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

function CardDescription({ className, ref, ...props }: CardDescriptionProps) {
  return <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

function CardContent({ className, ref, ...props }: CardContentProps) {
  return <div ref={ref} className={cn("p-4 sm:p-6 pt-0", className)} {...props} />;
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

function CardFooter({ className, ref, ...props }: CardFooterProps) {
  return (
    <div ref={ref} className={cn("flex items-center p-4 sm:p-6 pt-0", className)} {...props} />
  );
}

export { Card, CardButton, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
